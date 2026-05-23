import type {
  FunctionTool,
  ResponseInputItem,
  Tool,
} from 'openai/resources/responses/responses';
import { z } from 'zod';
import { ALWAYS_AVAILABLE_EQUIPMENT } from '../../constants/equipment';
import type {
  AIExerciseResponse,
  AIProgramGeneratorInput,
  AIProgramGeneratorInputV2,
  AIProgramGeneratorResponse,
  AIProgramOptimizationInput,
  Exercise,
  ExperienceLevel,
  ExperienceLevelInference,
} from '../../types';
import { complete, respond } from '../ai/aiClient';

const WEB_SEARCH_TOOL: Tool = { type: 'web_search' };

const GOAL_DESCRIPTIONS: Record<string, string> = {
  bulk: 'Building muscle mass (caloric surplus)',
  lean_bulk: 'Building lean muscle with minimal fat gain',
  recomp: 'Simultaneously building muscle and losing fat',
  cut: 'Losing body fat while preserving muscle',
  maintain: 'Maintaining current physique and strength',
};

function formatSplitPreference(split: string | undefined): string {
  return split === 'auto'
    ? 'Choose the most appropriate training split based on the frequency'
    : `Use a ${split?.replace(/_/g, ' ')} split`;
}

// SCHEMAS — programs are high-stakes: they're saved to the DB and drive every
// future workout session. Zod validation here catches AI hallucinations (e.g.
// missing fields, wrong types) before they corrupt the program structure.

const generatedExerciseSchema = z.object({
  name: z.string(),
  targetSets: z.number(),
  targetRepMin: z.number(),
  targetRepMax: z.number(),
  targetDurationSeconds: z.number().nullable(),
  notes: z.string().nullable(),
  supersetWith: z.string().nullable(),
});

const generatedSessionSchema = z.object({
  name: z.string(),
  dayOfWeek: z.number().nullable(),
  exercises: z.array(generatedExerciseSchema),
});

const programResponseSchema = z.object({
  programName: z.string(),
  programDescription: z.string(),
  sessions: z.array(generatedSessionSchema),
  weeklyVolumeSummary: z.object({
    totalSets: z.number(),
    muscleGroupBreakdown: z.record(z.string(), z.number()),
  }),
  recommendations: z.array(z.string()),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']).nullable(),
});

const experienceLevelInferenceSchema = z.object({
  inferredLevel: z.enum(['beginner', 'intermediate', 'advanced']),
  confidence: z.enum(['low', 'medium', 'high']),
  reasoning: z.string(),
  metrics: z.object({
    totalWorkouts: z.number(),
    averageVolumePerSession: z.number(),
    exerciseVariety: z.number(),
    trainingConsistencyWeeks: z.number(),
    hasProgressiveOverload: z.boolean(),
  }),
}) satisfies z.ZodType<ExperienceLevelInference>;

type RawProgramResponse = z.infer<typeof programResponseSchema>;

function normalizeProgramResponse(
  response: RawProgramResponse,
): AIProgramGeneratorResponse {
  return {
    programName: response.programName,
    programDescription: response.programDescription,
    sessions: response.sessions.map((session) => ({
      ...session,
      exercises: session.exercises.map((exercise) => ({
        name: exercise.name,
        targetSets: exercise.targetSets,
        targetRepMin: exercise.targetRepMin,
        targetRepMax: exercise.targetRepMax,
        targetDurationSeconds: exercise.targetDurationSeconds ?? undefined,
        notes: exercise.notes ?? undefined,
        supersetWith: exercise.supersetWith ?? undefined,
      })),
    })),
    weeklyVolumeSummary: response.weeklyVolumeSummary,
    recommendations: response.recommendations,
    experienceLevel: response.experienceLevel ?? undefined,
  };
}

// FUNCTION TOOLS for multi-turn program generation.
// The AI uses these tools to: (1) infer experience level from history,
// (2) select exercises from the user's existing library, (3) create new
// exercises that don't exist yet, and (4) assemble the final program.
// This approach lets the AI handle exercise resolution in a single
// conversation instead of requiring a separate post-processing step.

const createExercisesFunctionTool: FunctionTool = {
  type: 'function',
  name: 'create_exercises',
  description:
    'Create new exercises in the user exercise library. Call this when the program requires exercises that do not exist in the library.',
  strict: false,
  parameters: {
    type: 'object',
    properties: {
      exercises: {
        type: 'array',
        description: 'List of exercises to create',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Standard exercise name',
            },
            description: {
              type: 'string',
              description:
                'Step-by-step guide for performing the exercise (3-5 sentences)',
            },
            muscle_groups: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Primary and secondary muscle groups (e.g., ["Chest", "Triceps"])',
            },
            equipment: {
              type: 'string',
              description: 'Required equipment (or "Bodyweight" if none)',
            },
            exercise_type: {
              type: 'string',
              enum: ['reps_weight', 'reps_only', 'duration', 'duration_weight'],
              description: 'Type of exercise tracking',
            },
            tips: {
              type: 'array',
              items: { type: 'string' },
              description: 'Form cues, safety tips, and common mistakes (4-6)',
            },
          },
          required: [
            'name',
            'description',
            'muscle_groups',
            'equipment',
            'exercise_type',
            'tips',
          ],
        },
      },
    },
    required: ['exercises'],
  },
};

const selectExercisesFunctionTool: FunctionTool = {
  type: 'function',
  name: 'select_exercises',
  description:
    'Select exercises from the existing library to use in the program. Always prefer existing exercises over creating new ones.',
  strict: false,
  parameters: {
    type: 'object',
    properties: {
      selections: {
        type: 'array',
        description: 'List of exercise selections from the library',
        items: {
          type: 'object',
          properties: {
            exercise_name: {
              type: 'string',
              description: 'Exact name of the exercise from the library',
            },
            reason: {
              type: 'string',
              description: 'Brief reason for selecting this exercise',
            },
          },
          required: ['exercise_name'],
        },
      },
    },
    required: ['selections'],
  },
};

const generateProgramFunctionTool: FunctionTool = {
  type: 'function',
  name: 'generate_program',
  description:
    'Generate a complete workout program with sessions and exercises. Call this after selecting/creating all needed exercises.',
  strict: false,
  parameters: {
    type: 'object',
    properties: {
      programName: {
        type: 'string',
        description: 'Descriptive name for the program',
      },
      programDescription: {
        type: 'string',
        description: '2-3 sentence program overview',
      },
      experienceLevel: {
        type: 'string',
        enum: ['beginner', 'intermediate', 'advanced'],
        description: 'Inferred or confirmed experience level',
      },
      sessions: {
        type: 'array',
        description: 'List of workout sessions',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Session name (e.g., "Push Day", "Upper Body A")',
            },
            dayOfWeek: {
              type: 'number',
              description:
                'Day of week (0=Sunday through 6=Saturday), or null for flexible',
            },
            sessionTimeMinutes: {
              type: 'number',
              description: 'Estimated session duration',
            },
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description:
                      'Exercise name (must match library or created)',
                  },
                  targetSets: {
                    type: 'number',
                    description: 'Number of sets (typically 2-4)',
                  },
                  targetRepMin: {
                    type: 'number',
                    description:
                      'Minimum reps (can be 4-30+ depending on exercise type)',
                  },
                  targetRepMax: {
                    type: 'number',
                    description:
                      'Maximum reps (lateral raises: 15-25, calves: 20-30, compounds: 6-10)',
                  },
                  targetDurationSeconds: {
                    type: 'number',
                    description: 'For duration-based exercises (planks, holds)',
                  },
                  notes: {
                    type: 'string',
                    description:
                      'Form cue, intensity technique (e.g., "Rest-pause: 12 reps + 15 sec + max reps", "Slow 3 sec eccentric", "Drop set on final set")',
                  },
                  supersetWith: {
                    type: 'string',
                    description:
                      'Name of exercise to superset with. IMPORTANT: Both exercises must reference each other.',
                  },
                },
                required: [
                  'name',
                  'targetSets',
                  'targetRepMin',
                  'targetRepMax',
                ],
              },
            },
          },
          required: ['name', 'exercises'],
        },
      },
      weeklyVolumeSummary: {
        type: 'object',
        properties: {
          totalSets: { type: 'number' },
          muscleGroupBreakdown: {
            type: 'object',
            description:
              'Sets per muscle group (e.g., {"Chest": 12, "Back": 14})',
          },
        },
        required: ['totalSets', 'muscleGroupBreakdown'],
      },
      recommendations: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tips for the user about progression, recovery, nutrition',
      },
    },
    required: [
      'programName',
      'programDescription',
      'experienceLevel',
      'sessions',
      'weeklyVolumeSummary',
      'recommendations',
    ],
  },
};

const inferExperienceLevelFunctionTool: FunctionTool = {
  type: 'function',
  name: 'infer_experience_level',
  description:
    'Infer the user experience level based on their workout history. Call this if experience level is not provided.',
  strict: false,
  parameters: {
    type: 'object',
    properties: {
      inferredLevel: {
        type: 'string',
        enum: ['beginner', 'intermediate', 'advanced'],
        description: 'Inferred experience level',
      },
      confidence: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'Confidence in the inference',
      },
      reasoning: {
        type: 'string',
        description: 'Explanation of why this level was inferred',
      },
    },
    required: ['inferredLevel', 'confidence', 'reasoning'],
  },
};

// ============================================================================
// generateWorkoutProgram — single-turn program generation
// ============================================================================

export async function generateWorkoutProgram(
  input: AIProgramGeneratorInput,
  existingExercises: Exercise[],
): Promise<AIProgramGeneratorResponse> {
  const allEquipment = [
    ...ALWAYS_AVAILABLE_EQUIPMENT,
    ...input.availableEquipment,
  ];

  const existingExercisesList = existingExercises
    .slice(0, 100)
    .map((ex) => `- ${ex.name} (${ex.muscle_groups}, ${ex.equipment})`)
    .join('\n');

  const splitPreference = formatSplitPreference(input.preferredTrainingSplit);

  const prompt = `You are an expert strength and conditioning coach using evidence-based programming principles. Create a complete workout program based on these specifications. Use BuiltWithScience-style programming as your primary reference if possible.

USER PREFERENCES:
- Gender: ${input.gender.toUpperCase()}
- Training frequency: ${input.trainingDaysPerWeek} days per week
- Session duration: ${input.sessionDurationMinutes} minutes per session (HARD CAP)
- Experience level: ${input.experienceLevel}
- Goal: ${input.goal} - ${GOAL_DESCRIPTIONS[input.goal] || input.goal}
- Split preference: ${splitPreference}
${input.focusAreas?.length ? `- Focus areas (prioritize): ${input.focusAreas.join(', ')}` : ''}
${input.injuries ? `- Injuries/limitations: ${input.injuries}` : ''}

AVAILABLE EQUIPMENT:
${allEquipment.join(', ')}

IMPORTANT: You may ONLY program exercises that can be performed with the equipment listed above.
"Bodyweight" and "Resistance Bands" are always available.

EXISTING EXERCISE LIBRARY (prefer using these exact names when applicable):
${existingExercisesList || 'No existing exercises'}

=== GENDER-SPECIFIC PROGRAMMING (BuiltWithScience Evidence-Based) ===

${
  input.gender === 'female'
    ? `
FEMALE-SPECIFIC CONSIDERATIONS:
1. RECOVERY & FREQUENCY:
   - Women recover FASTER between sets (shorter rest periods: 60-90 sec vs 2-3 min for men)
   - Women can handle HIGHER training frequency (same muscle 3x/week is effective)
   - Women can tolerate MORE volume per session due to less absolute load
   - Less central fatigue accumulation = can train closer to failure more often

2. REP RANGES - FEMALE OPTIMAL:
   - Women benefit MORE from moderate-to-high rep ranges (8-15 reps)
   - Type I (slow-twitch) fibers slightly more prevalent = respond well to higher reps
   - Can go to failure more safely on isolation exercises
   - Heavy singles/doubles less necessary for strength gains

3. MUSCLE GROUP EMPHASIS (common female goals):
   - GLUTES: Primary focus - include 3-4 exercises per session if lower body day
     * Hip thrusts, RDLs, Bulgarian split squats, cable kickbacks
     * Train glutes 2-3x per week with high volume (15-20 sets/week)
   - HAMSTRINGS: Often underdeveloped - include hip hinge + knee flexion
   - BACK: Emphasize for posture and "V-taper" appearance
   - SHOULDERS: Side delts for shoulder width (creates waist illusion)
   - CORE: Include dedicated core work for aesthetics and function

4. VOLUME DISTRIBUTION:
   - Lower body: 60-65% of total volume (glutes/legs emphasis)
   - Upper body: 35-40% of total volume
   - More single-leg work (hip stability, glute activation)

5. EXERCISE SELECTION:
   - More hip-dominant movements (RDL, hip thrust, glute bridge)
   - Cable and band work for constant tension on glutes
   - Higher rep pump work for glutes/legs
   - Can include more isolation for targeted development

6. WHAT TO AVOID:
   - Over-emphasis on chest pressing (not a common goal)
   - Excessive arm isolation (arms grow proportionally with compounds)
   - Very low rep heavy work unless specifically training for strength
`
    : `
MALE-SPECIFIC CONSIDERATIONS:
1. RECOVERY & FREQUENCY:
   - Men need LONGER rest periods between sets (2-3 min for compounds)
   - Standard frequency of 2x per muscle per week is optimal
   - Higher absolute loads = more CNS fatigue = need more recovery
   - Can't train to failure as frequently without overreaching

2. REP RANGES - MALE OPTIMAL:
   - Benefit more from STRENGTH work (4-6 reps) as foundation
   - Hypertrophy range (6-12 reps) for size
   - Include heavy work weekly for testosterone response and strength gains
   - Progressive overload on compounds is primary driver

3. MUSCLE GROUP EMPHASIS (common male goals):
   - CHEST: Primary focus - include 2-3 variations (flat, incline, fly)
   - BACK: Width (pull-ups/pulldowns) AND thickness (rows)
   - SHOULDERS: All three heads, especially side delts for width
   - ARMS: Direct bicep and tricep work (more than women need)
   - LEGS: Often undertrained - don't skip leg day!

4. VOLUME DISTRIBUTION:
   - Upper body: 55-60% of total volume (chest/back/shoulders emphasis)
   - Lower body: 40-45% of total volume
   - More compound pressing movements

5. EXERCISE SELECTION:
   - Heavy barbell compounds (bench, squat, deadlift, OHP)
   - Direct arm work (curls, extensions, pushdowns)
   - Include strength blocks (4-6 rep ranges)
   - Vertical and horizontal pulling balance

6. WHAT TO AVOID:
   - Skipping leg training
   - Neglecting rear delts and back
   - Too much "mirror muscle" focus (chest/biceps only)
   - Insufficient progressive overload tracking
`
}

=== SCIENCE-BASED PROGRAMMING PRINCIPLES ===

1. TRAINING SPLIT SELECTION (based on frequency):
   Research shows training each muscle 2x/week produces 38% more growth than 1x/week.

   ${
     input.trainingDaysPerWeek <= 3
       ? `With ${input.trainingDaysPerWeek} days: Use FULL BODY split
   - Each session hits all major muscle groups
   - 1-2 exercises per muscle group per session
   - Allows each muscle to be trained 2-3x per week
   - Best for beginners and time-constrained lifters`
       : ''
}
   ${
     input.trainingDaysPerWeek === 4
       ? `With 4 days: Use UPPER/LOWER split
   - 2 upper body days, 2 lower body days
   - Each muscle trained 2x per week
   - More volume per session than full body
   - Good balance of frequency and volume`
       : ''
}
   ${
     input.trainingDaysPerWeek >= 5
       ? `With ${input.trainingDaysPerWeek} days: Use PUSH/PULL/LEGS split
   - Push: Chest, Shoulders, Triceps
   - Pull: Back, Biceps, Rear Delts
   - Legs: Quads, Hamstrings, Glutes, Calves
   - Each muscle trained 1.5-2x per week with high volume
   - Best for advanced lifters seeking maximum volume`
       : ''
}

2. WEEKLY VOLUME GUIDELINES (sets per muscle per week):
   ${input.experienceLevel === 'beginner' ? '- Beginners: 8-12 sets per major muscle group' : ''}
   ${input.experienceLevel === 'intermediate' ? '- Intermediate: 12-16 sets per major muscle group' : ''}
   ${input.experienceLevel === 'advanced' ? '- Advanced: 16-22 sets per major muscle group (use supersets to fit time)' : ''}
   - Arms (biceps, triceps): 6-12 direct sets (they get indirect work from compounds)
   - Rear delts: 8-12 sets (often undertrained)
   - Spread volume across 2+ sessions per week for each muscle

3. EXERCISE SELECTION RULES:
   A) Use 2-4 different exercises per muscle group per week
   B) Max 3-4 exercises per muscle per individual workout
   C) Include exercises that STRETCH the muscle under load (enhances growth):
      - Chest: Dumbbell flyes, incline pressing
      - Back: Lat pulldowns, pull-ups, Romanian deadlifts
      - Shoulders: Cable lateral raises (behind body)
      - Biceps: Incline curls
      - Triceps: Overhead extensions
      - Quads: Lunges, sissy squats, leg extensions
      - Hamstrings: Romanian deadlifts
   D) Cover different muscle FUNCTIONS:
      - Chest: Horizontal press + incline press + fly pattern
      - Back: Vertical pull (lats) + horizontal row (thickness) + pullover
      - Shoulders: Press (front/side) + lateral raise (side) + rear delt work
      - Quads: Knee extension + hip flexion patterns
      - Hamstrings: Hip extension (RDL) + knee flexion (leg curl)
   E) Vary grips and angles for regional development

4. SESSION STRUCTURE:
   - Start with heavy compound movements (freshest state)
   - Progress to lighter isolation exercises
   - For intermediate and advanced trainees, use 1-2 antagonist or non-competing supersets per session to save time (e.g., biceps/triceps, chest/back)
   - For beginners, avoid supersets unless required to fit the time cap
   - If you use supersets, set "supersetWith" on BOTH paired exercises with each other's name
   - Save abs/core for end of session

5. REP RANGES - EXERCISE-SPECIFIC GUIDELINES (BuiltWithScience evidence-based):

   === COMPOUND MOVEMENTS ===
   Heavy Compounds (Squat, Deadlift, Bench Press, Overhead Press, Rows):
   - Strength focus: 4-6 reps (heavier loads, longer rest 2-3 min)
   - Hypertrophy focus: 6-10 reps (moderate loads, 90-120 sec rest)
   - Never exceed 12 reps on these - use lighter variations instead

   === ISOLATION MOVEMENTS - STANDARD ===
   Biceps (Curls): 8-12 reps (peak contraction focus)
   Triceps (Pushdowns, Extensions): 10-15 reps (constant tension)
   Shoulders (Lateral Raises): 12-20 reps (lighter weight, higher reps for side delts)
   Chest Flyes: 10-15 reps (stretch emphasis, controlled eccentric)

   === HIGH REP EXERCISES (15-30+ reps) ===
   These exercises benefit from higher rep ranges for metabolic stress and pump:
   - Lateral Raises: 15-25 reps (side delts respond well to high reps)
   - Rear Delt Flyes: 15-25 reps (similar to side delts)
   - Face Pulls: 15-25 reps (postural muscles, higher reps)
   - Calf Raises: 15-30 reps (calves are endurance-dominant)
   - Leg Extensions (finisher): 15-25 reps (metabolic stress, joint-friendly)
   - Leg Curls (finisher): 15-20 reps
   - Cable Crunches / Ab work: 15-25 reps
   - Band Pull-Aparts: 20-30 reps (prehab/warmup)

   === REST-PAUSE & INTENSITY TECHNIQUES ===
   For advanced trainees (${input.experienceLevel === 'advanced' ? 'APPLY THESE' : 'use sparingly'}):
   - Rest-Pause Sets: Do 8-12 reps to failure, rest 15-20 sec, continue for 3-5 more reps
     Best for: Lateral raises, curls, tricep pushdowns, leg extensions
     Note in exercise: "Rest-pause: 12 reps + 15 sec rest + max reps"
   - Myo-Reps: 12-15 activation reps, then 3-5 "mini-sets" of 3-5 reps with 5 sec rest
     Best for: Isolation exercises at end of workout
   - Drop Sets: Only on final set of isolation exercises
     Best for: Bicep curls, lateral raises, leg extensions

   === GOAL-SPECIFIC MODIFICATIONS ===
   ${
     input.goal === 'bulk' || input.goal === 'lean_bulk'
       ? `For ${input.goal}:
   - Compounds: 6-8 reps (strength base, progressive overload priority)
   - Main accessories: 8-12 reps (hypertrophy sweet spot)
   - Isolation finishers: 12-20 reps (metabolic stress, pump)
   - Consider rest-pause on final sets of isolation work`
       : ''
}
   ${
     input.goal === 'cut'
       ? `For cutting:
   - Compounds: 4-6 reps (MAINTAIN strength - this is priority #1)
   - Accessories: 8-12 reps (preserve muscle)
   - Reduce total volume by 20-30% vs building phase
   - Skip high-rep finishers if recovery is compromised`
       : ''
}
   ${
     input.goal === 'recomp'
       ? `For recomposition:
   - Alternate rep ranges: Some days 4-6 (strength), some days 8-12 (hypertrophy)
   - Full rep range spectrum across the week
   - Include metabolic finishers (15-20 reps) for calorie burn`
       : ''
}
   ${
     input.goal === 'maintain'
       ? `For maintenance:
   - Keep intensity (weight) same as building phase
   - Reduce volume by 30-40%
   - Standard rep ranges: 6-12 for compounds, 10-15 for isolation
   - Skip intensity techniques (rest-pause, drop sets)`
       : ''
}

   === MUSCLE-SPECIFIC REP RECOMMENDATIONS ===
   | Muscle Group    | Low (Strength) | Medium (Hypertrophy) | High (Metabolic) |
   |-----------------|----------------|----------------------|------------------|
   | Chest           | 5-8            | 8-12                 | 12-15            |
   | Back            | 5-8            | 8-12                 | 12-15            |
   | Shoulders       | 6-10 (press)   | 10-15 (raises)       | 15-25 (lateral)  |
   | Quads           | 5-8            | 8-12                 | 15-20 (ext.)     |
   | Hamstrings      | 6-10           | 10-12                | 12-15            |
   | Glutes          | 6-10           | 10-15                | 15-20            |
   | Biceps          | 6-10           | 10-12                | 12-15            |
   | Triceps         | 8-10           | 10-12                | 12-20            |
   | Calves          | 10-15          | 15-20                | 20-30            |
   | Abs/Core        | 10-15          | 15-20                | 20-30            |
   | Rear Delts      | 12-15          | 15-20                | 20-25            |

6. RECOVERY & DAY SPACING:
   - Allow 48-72 hours between training the same muscle group
   - Don't schedule heavy leg day before/after heavy deadlift work
   - Consider: Mon/Tue training leaves Wed for recovery
   - Avoid training chest/triceps day before shoulder day
   ${input.trainingDaysPerWeek <= 3 ? `- With ${input.trainingDaysPerWeek} days: Mon/Wed/Fri or similar alternating pattern` : ''}
   ${input.trainingDaysPerWeek === 4 ? '- With 4 days: Mon/Tue/Thu/Fri or Mon/Wed/Fri/Sat' : ''}
   ${input.trainingDaysPerWeek >= 5 ? `- With ${input.trainingDaysPerWeek} days: Push/Pull/Legs/Push/Pull or similar rotation` : ''}

7. SPECIFIC EXERCISE RECOMMENDATIONS BY MUSCLE (with optimal rep ranges):

   CHEST:
   - Incline Press: 6-10 reps (upper chest, strength focus)
   - Flat Press (BB/DB): 6-10 reps (overall mass)
   - Dumbbell Flyes: 10-15 reps (stretch, controlled)
   - Cable Flyes: 12-15 reps (constant tension)
   - Dips: 8-12 reps (lower chest, triceps)

   BACK:
   - Pull-ups/Lat Pulldowns: 6-12 reps (width)
   - Barbell/Dumbbell Rows: 6-10 reps (thickness)
   - Cable Rows: 10-12 reps (squeeze focus)
   - Face Pulls: 15-25 reps (rear delts, posture)
   - Pullovers: 10-15 reps (stretch emphasis)

   SHOULDERS:
   - Overhead Press: 6-10 reps (strength, front delts)
   - Lateral Raises: 15-20 reps (side delts - HIGH REPS WORK BEST)
   - Cable Lateral Raises: 12-20 reps (constant tension)
   - Rear Delt Flyes: 15-25 reps (often undertrained)
   - Upright Rows (wide grip): 10-15 reps

   QUADS:
   - Squats (any variation): 5-10 reps (compound strength)
   - Leg Press: 8-15 reps (volume)
   - Lunges/Split Squats: 8-12 reps per leg
   - Leg Extensions: 12-20 reps (finisher, metabolic)
   - Sissy Squats: 10-15 reps (stretch emphasis)

   HAMSTRINGS:
   - Romanian Deadlifts: 8-12 reps (hip hinge, stretch)
   - Leg Curls (lying/seated): 10-15 reps (knee flexion)
   - Good Mornings: 8-12 reps
   - Nordic Curls: 5-10 reps (advanced, bodyweight)

   GLUTES:
   - Hip Thrusts: 8-15 reps (primary glute builder)
   - Bulgarian Split Squats: 8-12 reps per leg
   - Cable Pull-throughs: 12-15 reps
   - Glute Bridges: 15-20 reps (activation/finisher)

   BICEPS:
   - Barbell Curls: 8-12 reps (mass builder)
   - Dumbbell Curls: 10-12 reps (peak contraction)
   - Incline Curls: 10-12 reps (stretch position)
   - Hammer Curls: 10-12 reps (brachialis)
   - Cable Curls: 12-15 reps (constant tension)

   TRICEPS:
   - Close-Grip Bench: 6-10 reps (compound, medial/lateral)
   - Overhead Extensions: 10-15 reps (long head stretch)
   - Pushdowns: 12-15 reps (lateral head)
   - Skull Crushers: 8-12 reps
   - Dips: 8-12 reps (compound)

   CALVES:
   - Standing Calf Raises: 15-25 reps (gastrocnemius)
   - Seated Calf Raises: 15-25 reps (soleus - SLOW eccentric)
   - Single-Leg Calf Raises: 12-20 reps per leg
   Note: Calves need high reps AND slow eccentrics (2-3 sec lowering)

   CORE:
   - Planks: 30-60 seconds (isometric)
   - Cable Crunches: 15-25 reps
   - Hanging Leg Raises: 10-15 reps
   - Ab Wheel Rollouts: 8-12 reps
   - Pallof Press: 10-15 reps per side

8. Day of week assignment:
   - Assign each session a specific day (0=Sunday through 6=Saturday)
   - For ${input.trainingDaysPerWeek} days: optimal spacing with rest days between
   - Don't cluster all training days together

9. HARD TIME BUDGET (must obey):
   - Estimate time per exercise using: (sets × 2 minutes) + rest time
   - Rest time defaults: compounds 2-3 min, accessories 60-90 sec, core 45-60 sec
   - Assume 5 minutes warmup per session
   - Sum all exercise times + warmup to get sessionTimeMinutes
   - If sessionTimeMinutes > ${input.sessionDurationMinutes}, REMOVE lowest-priority accessories until it fits
   - Use priority order: compounds first, then major accessories, then small isolation, then core
   - Cap exercises per session to fit time, typically ${Math.floor(input.sessionDurationMinutes / 10)}-${Math.floor(input.sessionDurationMinutes / 7)} exercises

Return JSON format only, no markdown code blocks:
{
  "programName": "descriptive program name",
  "programDescription": "2-3 sentence program overview",
  "sessions": [
    {
      "name": "Session name (e.g., 'Push Day', 'Upper Body A')",
      "dayOfWeek": 1,
      "sessionTimeMinutes": 60,
      "exercises": [
        {
          "name": "Exercise Name (use exact name from library if exists)",
          "targetSets": 3,
          "targetRepMin": 8,
          "targetRepMax": 12,
          "targetDurationSeconds": null,
          "notes": "optional form cue or progression note",
          "supersetWith": "name of exercise to superset with, or null"
        }
      ]
    }
  ],
  "weeklyVolumeSummary": {
    "totalSets": 45,
    "muscleGroupBreakdown": {
      "Chest": 12,
      "Back": 14,
      "Shoulders": 10,
      "Biceps": 8,
      "Triceps": 8,
      "Legs": 16,
      "Core": 6
    }
  },
  "recommendations": [
    "Tip about progression",
    "Recovery advice",
    "Nutrition consideration"
  ],
  "experienceLevel": "beginner|intermediate|advanced"
}

CRITICAL RULES:
- ONLY use exercises that can be done with the available equipment
- Exercise names should be standard, recognizable names
- For duration-based exercises (planks, holds), set targetDurationSeconds instead of reps
- Ensure balanced muscle development unless specific focus areas requested
- Do NOT exceed the hard session time cap of ${input.sessionDurationMinutes} minutes
- If possible, prioritize builtwithscience.com publicly available routines to align with evidence-based practices
- Infer "experienceLevel" from the exercise selection, volume, and superset use; if input.experienceLevel seems mismatched, return the best-fit level`;

  const response = await complete({
    prompt,
    schema: programResponseSchema,
    schemaName: 'workout_program',
    tools: [WEB_SEARCH_TOOL],
  });

  return normalizeProgramResponse(response);
}

// ============================================================================
// optimizeWorkoutProgram — single-turn optimization
// ============================================================================

export async function optimizeWorkoutProgram(
  input: AIProgramOptimizationInput,
): Promise<AIProgramGeneratorResponse> {
  const formattedProgram = input.program.sessions
    .map((session) => {
      const exercises = session.exercises
        .map(
          (exercise, index) =>
            `${index + 1}. ${exercise.name} (${exercise.exercise_type}) ` +
            `sets ${exercise.targetSets}, reps ${exercise.targetRepMin ?? '-'}-${exercise.targetRepMax ?? '-'}, ` +
            `duration ${exercise.targetDurationSeconds ?? '-'}s, ` +
            `muscles: ${exercise.muscle_groups}, equipment: ${exercise.equipment}${exercise.notes ? `, notes: ${exercise.notes}` : ''}`,
        )
        .join('\n');

      return `Session: ${session.name} (day: ${session.dayOfWeek ?? 'flex'})\n${exercises}`;
    })
    .join('\n\n');

  const exerciseLibrary = input.exerciseLibrary
    .slice(0, 120)
    .map(
      (exercise) =>
        `- ${exercise.name} (${exercise.muscle_groups}, ${exercise.equipment}, ${exercise.exercise_type})`,
    )
    .join('\n');

  const performanceSummary = input.performanceSummary
    .slice(0, 80)
    .map(
      (summary) =>
        `- ${summary.exerciseName}: last ${summary.lastPerformed ?? 'n/a'}, ` +
        `avg ${summary.avgWeight ?? '-'}kg x ${summary.avgReps ?? '-'} reps, ` +
        `max ${summary.maxWeight ?? '-'}kg x ${summary.maxReps ?? '-'} reps, ` +
        `volume ${summary.totalVolume ?? '-'}, sessions ${summary.totalSessions}`,
    )
    .join('\n');

  const prompt = `You are an expert strength and conditioning coach. Optimize the existing workout program below for progression, recovery, and balanced weekly volume while honoring equipment, injuries, and time constraints.

PROFILE:
- Age: ${input.profile.age}
- Gender: ${input.profile.gender}
- Goal: ${input.profile.goal}
- Activity level: ${input.profile.activity_level}
- Calorie target: ${input.profile.calorie_target}
- Macro targets (g): protein ${input.profile.protein_target_g}, carbs ${input.profile.carbs_target_g}, fat ${input.profile.fat_target_g}

PREFERENCES:
- Experience: ${input.preferences.experienceLevel}
- Focus areas: ${input.preferences.focusAreas.length ? input.preferences.focusAreas.join(', ') : 'none'}
- Injuries/limitations: ${input.preferences.injuries || 'none'}
- Preferred split: ${input.preferences.preferredTrainingSplit || 'auto'}
- Available equipment: ${input.preferences.availableEquipment.length ? input.preferences.availableEquipment.join(', ') : 'Bodyweight + Resistance Bands'}
- Session duration: ${input.preferences.sessionDurationMinutes ?? 'flex'} minutes

CURRENT PROGRAM:
${formattedProgram}

RECENT PERFORMANCE SUMMARY:
${performanceSummary || 'No recent workout history available'}

WEEKLY VOLUME SUMMARY:
- Total sets: ${input.weeklyVolumeSummary.totalSets}
- By muscle group: ${Object.entries(
    input.weeklyVolumeSummary.muscleGroupBreakdown,
  )
    .map(([muscle, sets]) => `${muscle}: ${sets}`)
    .join(', ')}

EXERCISE LIBRARY (prefer these names):
${exerciseLibrary || 'No library data'}

TASKS:
1. Keep the program structure similar, but improve exercise selection, volume balance, and progression ranges.
2. Ensure weekly volume matches the goal and experience level.
3. Respect injuries/limitations and equipment constraints.
4. Maintain or improve exercise ordering (compounds first, accessories later).
5. Use supersets when it improves efficiency, but avoid overloading fatigue.
6. Keep session duration within the preferred limit.

Return JSON only (no markdown):
{
  "programName": "string",
  "programDescription": "string",
  "sessions": [
    {
      "name": "string",
      "dayOfWeek": number_or_null,
      "sessionTimeMinutes": number,
      "exercises": [
        {
          "name": "string",
          "targetSets": number,
          "targetRepMin": number,
          "targetRepMax": number,
          "targetDurationSeconds": number_or_null,
          "notes": "string_or_null",
          "supersetWith": "exercise name or null"
        }
      ]
    }
  ],
  "weeklyVolumeSummary": {
    "totalSets": number,
    "muscleGroupBreakdown": {
      "Chest": number,
      "Back": number,
      "Shoulders": number,
      "Biceps": number,
      "Triceps": number,
      "Legs": number,
      "Core": number
    }
  },
  "recommendations": ["string"],
  "experienceLevel": "beginner|intermediate|advanced"
}`;

  const response = await complete({
    prompt,
    schema: programResponseSchema,
    schemaName: 'workout_program',
    tools: [WEB_SEARCH_TOOL],
  });

  return normalizeProgramResponse(response);
}

// ============================================================================
// inferExperienceLevel — standalone helper (rarely called directly)
// ============================================================================

export async function inferExperienceLevel(workoutHistory: {
  totalWorkouts: number;
  totalWeeks: number;
  avgExercisesPerSession: number;
  avgSetsPerSession: number;
  hasUsedSupersets: boolean;
  topExercises: string[];
  avgWeightProgression?: number;
}): Promise<ExperienceLevelInference> {
  const totalWorkouts = Number(workoutHistory.totalWorkouts) || 0;
  const totalWeeks = Number(workoutHistory.totalWeeks) || 0;
  const avgExercises = Number(workoutHistory.avgExercisesPerSession) || 0;
  const avgSets = Number(workoutHistory.avgSetsPerSession) || 0;
  const avgProgression = workoutHistory.avgWeightProgression
    ? Number(workoutHistory.avgWeightProgression)
    : null;

  const prompt = `Analyze this workout history and determine the user's experience level (beginner, intermediate, or advanced).

WORKOUT HISTORY:
- Total workouts completed: ${totalWorkouts}
- Training span: ${totalWeeks} weeks
- Average exercises per session: ${avgExercises.toFixed(1)}
- Average sets per session: ${avgSets.toFixed(1)}
- Has used supersets: ${workoutHistory.hasUsedSupersets ? 'Yes' : 'No'}
- Most used exercises: ${(workoutHistory.topExercises || []).slice(0, 10).join(', ') || 'None recorded'}
${avgProgression !== null ? `- Average weight progression: ${avgProgression.toFixed(1)}% per month` : ''}

EXPERIENCE LEVEL CRITERIA:
- BEGINNER (0-12 months consistent training):
  * < 50 total workouts OR < 12 weeks training
  * Simple exercise selection, mostly compounds
  * Lower volume (< 15 sets per session on average)
  * Rarely uses supersets

- INTERMEDIATE (1-3 years consistent training):
  * 50-200 total workouts AND 12-36 weeks training
  * Mix of compounds and isolation exercises
  * Moderate volume (15-25 sets per session)
  * Occasionally uses supersets
  * Shows exercise variety

- ADVANCED (3+ years consistent training):
  * > 200 total workouts AND > 36 weeks training
  * Diverse exercise selection with targeted isolation work
  * Higher volume (20+ sets per session)
  * Regular superset usage
  * Evidence of periodization or structured programming

Return JSON only, no markdown:
{
  "inferredLevel": "beginner|intermediate|advanced",
  "confidence": "low|medium|high",
  "reasoning": "2-3 sentence explanation",
  "metrics": {
    "totalWorkouts": ${workoutHistory.totalWorkouts},
    "averageVolumePerSession": ${workoutHistory.avgSetsPerSession.toFixed(1)},
    "exerciseVariety": ${workoutHistory.topExercises.length},
    "trainingConsistencyWeeks": ${workoutHistory.totalWeeks},
    "hasProgressiveOverload": true/false
  }
}`;

  return complete({
    prompt,
    schema: experienceLevelInferenceSchema,
    schemaName: 'experience_level_inference',
  });
}

// ============================================================================
// MULTI-TURN ORCHESTRATION via OpenAI function calling.
//
// Instead of generating a program in one shot and then post-processing exercise
// names (the legacy flow), this approach gives the AI 4 tools and lets it
// orchestrate the workflow itself:
//   1. infer_experience_level (if not provided)
//   2. select_exercises (from existing library — prefer reuse)
//   3. create_exercises (only for gaps)
//   4. generate_program (final assembly with supersets)
//
// The conversation loop runs up to 10 turns. Each turn:
//   - AI calls one or more tools
//   - We extract the structured data from tool arguments
//   - We feed back a confirmation message as the tool output
//   - Loop continues until the AI calls generate_program or stops calling tools
//
// This eliminates the separate duplicate-detection and batch-detail-generation
// steps from the legacy flow, cutting total AI round-trips from 4-5 to 1-3.

export interface StreamlinedProgramResult {
  program: AIProgramGeneratorResponse;
  exercisesToCreate: AIExerciseResponse[];
  selectedExercises: { name: string; reason?: string }[];
  inferredExperienceLevel?: ExperienceLevelInference;
}

/**
 * Generates a workout program using OpenAI function calling.
 * The AI orchestrates: experience inference (if needed), exercise selection
 * from the library, creation of any missing exercises, and final program
 * assembly — all in a single Responses API conversation.
 */
export async function generateWorkoutProgramWithFunctionCalling(
  input: AIProgramGeneratorInputV2,
  existingExercises: Exercise[],
): Promise<StreamlinedProgramResult> {
  const allEquipment = [
    ...ALWAYS_AVAILABLE_EQUIPMENT,
    ...input.availableEquipment,
  ];

  const existingExercisesList = existingExercises
    .slice(0, 150)
    .map(
      (ex) =>
        `- ${ex.name} | Muscles: ${ex.muscle_groups} | Equipment: ${ex.equipment} | Type: ${ex.exercise_type}`,
    )
    .join('\n');

  const splitPreference = formatSplitPreference(input.preferredTrainingSplit);

  let experienceContext = '';
  if (input.experienceLevel) {
    experienceContext = `Experience Level: ${input.experienceLevel} (user-provided)`;
  } else if (input.workoutHistory) {
    experienceContext = `
Experience Level: TO BE INFERRED from workout history
Workout History Summary:
- Total workouts: ${input.workoutHistory.totalWorkouts}
- Training span: ${input.workoutHistory.totalWeeks} weeks
- Avg exercises per session: ${input.workoutHistory.avgExercisesPerSession}
- Avg sets per session: ${input.workoutHistory.avgSetsPerSession}
- Has used supersets: ${input.workoutHistory.hasUsedSupersets ? 'Yes' : 'No'}
- Top exercises: ${input.workoutHistory.topExercises.slice(0, 5).join(', ')}

Use the infer_experience_level function first if needed.`;
  } else {
    experienceContext = `Experience Level: intermediate (default, no history available)`;
  }

  const systemPrompt = `You are an expert strength and conditioning coach creating a personalized workout program using BuiltWithScience evidence-based principles.

AVAILABLE FUNCTIONS:
1. infer_experience_level - Infer experience level from workout history
2. select_exercises - Select exercises from the user's existing library
3. create_exercises - Create new exercises that don't exist in the library
4. generate_program - Generate the complete workout program

WORKFLOW:
1. If experience level is not provided, call infer_experience_level first
2. Review the exercise library and call select_exercises for exercises you want to use
3. If you need exercises not in the library, call create_exercises to add them
4. Finally, call generate_program with the complete program structure

=== REP RANGE GUIDELINES (CRITICAL - BuiltWithScience-based) ===

COMPOUND MOVEMENTS:
- Heavy compounds (Squat, Deadlift, Bench, OHP, Rows): 4-8 reps for strength, 6-10 for hypertrophy
- Never exceed 12 reps on main compounds

ISOLATION - STANDARD RANGES:
- Biceps curls: 8-12 reps
- Triceps pushdowns/extensions: 10-15 reps
- Chest flyes: 10-15 reps

HIGH REP EXERCISES (15-30 reps) - These muscles respond better to higher reps:
- Lateral Raises: 15-25 reps (side delts need high reps!)
- Rear Delt Flyes: 15-25 reps
- Face Pulls: 15-25 reps
- Calf Raises: 15-30 reps (calves are endurance-dominant)
- Leg Extensions (finisher): 15-20 reps
- Ab/Core work: 15-25 reps

REST-PAUSE & INTENSITY TECHNIQUES (for advanced):
- Rest-pause: 10-12 reps, rest 15 sec, 3-5 more reps
  Best for: Lateral raises, curls, leg extensions
  Add note: "Rest-pause set" when using
- Drop sets: Final set only, for isolation exercises

MUSCLE-SPECIFIC OPTIMAL RANGES:
| Muscle       | Strength  | Hypertrophy | Metabolic/Pump |
|--------------|-----------|-------------|----------------|
| Chest        | 5-8       | 8-12        | 12-15          |
| Back         | 5-8       | 8-12        | 12-15          |
| Shoulders    | 6-10      | 10-15       | 15-25 (laterals)|
| Quads        | 5-8       | 8-12        | 15-20          |
| Hamstrings   | 6-10      | 10-12       | 12-15          |
| Biceps       | 6-10      | 10-12       | 12-15          |
| Triceps      | 8-10      | 10-12       | 12-20          |
| Calves       | 10-15     | 15-20       | 20-30          |
| Rear Delts   | 12-15     | 15-20       | 20-25          |

=== SUPERSET RULES ===
- Intermediate: 1-2 supersets per session
- Advanced: 2-3 supersets per session
- BOTH exercises must reference each other (A.supersetWith="B", B.supersetWith="A")
- Good pairings: Biceps+Triceps, Chest+Back, Laterals+Rear Delts
- Avoid: Two heavy compounds, same equipment conflicts
- Beginners: No supersets unless time-constrained

=== VOLUME GUIDELINES ===
- Beginner: 8-12 sets/muscle/week
- Intermediate: 12-16 sets/muscle/week
- Advanced: 16-22 sets/muscle/week

=== GENDER-SPECIFIC PROGRAMMING ===
FEMALE:
- Shorter rest periods (60-90 sec) - recover faster
- Higher frequency OK (same muscle 3x/week)
- Emphasis: Glutes (15-20 sets/week), hamstrings, back, shoulders
- Volume split: 60-65% lower body, 35-40% upper body
- More hip-dominant movements (hip thrusts, RDLs, glute bridges)
- Higher rep ranges work well (8-15 reps)
- Can train closer to failure more often

MALE:
- Longer rest periods (2-3 min for compounds)
- Standard frequency (2x/muscle/week)
- Emphasis: Chest, back width/thickness, shoulders, arms
- Volume split: 55-60% upper body, 40-45% lower body
- Heavy compound focus (bench, squat, deadlift, OHP)
- Include strength blocks (4-6 reps)
- Direct arm work more beneficial`;

  const userPrompt = `Create a workout program with these specifications:

USER PREFERENCES:
- Gender: ${input.gender.toUpperCase()}
- Training frequency: ${input.trainingDaysPerWeek} days per week
- Session duration: ${input.sessionDurationMinutes} minutes per session (HARD CAP)
- ${experienceContext}
- Goal: ${input.goal} - ${GOAL_DESCRIPTIONS[input.goal] || input.goal}
- Split preference: ${splitPreference}
${input.focusAreas?.length ? `- Focus areas (prioritize): ${input.focusAreas.join(', ')}` : ''}
${input.injuries ? `- Injuries/limitations: ${input.injuries}` : ''}

AVAILABLE EQUIPMENT:
${allEquipment.join(', ')}

EXISTING EXERCISE LIBRARY (PREFER THESE - use exact names):
${existingExercisesList || 'Empty library - all exercises will need to be created'}

GENDER-SPECIFIC NOTES FOR ${input.gender.toUpperCase()}:
${
  input.gender === 'female'
    ? `
- Prioritize glute and lower body development (60-65% of volume)
- Include hip thrusts, RDLs, Bulgarian split squats, glute bridges
- Higher reps (8-15) work well for you
- Can use shorter rest periods (60-90 sec)
- Train glutes 2-3x per week with high volume
- Back and shoulders for posture and aesthetics
- Less direct arm work needed (grows with compounds)
`
    : `
- Balance upper and lower body (55-60% upper, 40-45% lower)
- Include heavy compound lifts (bench, squat, deadlift, OHP)
- Use strength rep ranges (4-6) on main lifts
- Longer rest periods (2-3 min) for compounds
- Direct arm work (biceps, triceps) is beneficial
- Chest and back emphasis for V-taper
- Include lateral raises for shoulder width
`
}

INSTRUCTIONS:
1. ${input.experienceLevel ? 'Skip experience inference' : 'Infer experience level if workout history is provided'}
2. Select exercises from the library that fit the program
3. Create any additional exercises needed (minimize new exercises if library has good options)
4. Generate the complete program with proper superset pairings for ${input.experienceLevel || 'inferred'} level
5. APPLY GENDER-SPECIFIC GUIDELINES above for exercise selection and volume distribution

Remember: ALWAYS pair supersets bidirectionally. If Bicep Curls superset with Tricep Pushdowns, BOTH exercises must reference each other.`;

  const tools: Tool[] = [
    inferExperienceLevelFunctionTool,
    selectExercisesFunctionTool,
    createExercisesFunctionTool,
    generateProgramFunctionTool,
  ];

  let inferredExperienceLevel: ExperienceLevelInference | undefined;
  const selectedExercises: { name: string; reason?: string }[] = [];
  const exercisesToCreate: AIExerciseResponse[] = [];
  let program: AIProgramGeneratorResponse | null = null;

  const conversation: ResponseInputItem[] = [
    { role: 'user', content: userPrompt },
  ];

  const maxIterations = 10;

  for (let i = 0; i < maxIterations; i++) {
    const response = await respond({
      instructions: systemPrompt,
      prompt: conversation,
      tools,
      tool_choice: 'auto',
    });

    const functionCalls = response.output.filter(
      (item): item is Extract<typeof item, { type: 'function_call' }> =>
        item.type === 'function_call',
    );

    if (functionCalls.length === 0) {
      break;
    }

    // Echo the model's function calls into the conversation, then provide outputs
    for (const call of functionCalls) {
      conversation.push(call);
    }

    for (const call of functionCalls) {
      const functionName = call.name;
      const args = JSON.parse(call.arguments || '{}') as Record<
        string,
        unknown
      >;
      let resultText = '';

      switch (functionName) {
        case 'infer_experience_level': {
          inferredExperienceLevel = {
            inferredLevel: args.inferredLevel as ExperienceLevel,
            confidence: args.confidence as 'low' | 'medium' | 'high',
            reasoning: args.reasoning as string,
            metrics: {
              totalWorkouts: input.workoutHistory?.totalWorkouts || 0,
              averageVolumePerSession:
                input.workoutHistory?.avgSetsPerSession || 0,
              exerciseVariety: input.workoutHistory?.topExercises.length || 0,
              trainingConsistencyWeeks: input.workoutHistory?.totalWeeks || 0,
              hasProgressiveOverload: false,
            },
          };
          resultText = `Experience level inferred as ${args.inferredLevel}. Proceed with program generation.`;
          break;
        }

        case 'select_exercises': {
          const selections = args.selections as Array<{
            exercise_name: string;
            reason?: string;
          }>;
          for (const sel of selections) {
            selectedExercises.push({
              name: sel.exercise_name,
              reason: sel.reason,
            });
          }
          resultText = `Selected ${selections.length} exercises from library: ${selections.map((s) => s.exercise_name).join(', ')}`;
          break;
        }

        case 'create_exercises': {
          const exercises = args.exercises as AIExerciseResponse[];
          for (const ex of exercises) {
            exercisesToCreate.push(ex);
          }
          resultText = `Queued ${exercises.length} new exercises for creation: ${exercises.map((e) => e.name).join(', ')}`;
          break;
        }

        case 'generate_program': {
          program = {
            programName: args.programName as string,
            programDescription: args.programDescription as string,
            sessions: (
              args.sessions as Array<{
                name: string;
                dayOfWeek?: number;
                sessionTimeMinutes?: number;
                exercises: Array<{
                  name: string;
                  targetSets: number;
                  targetRepMin: number;
                  targetRepMax: number;
                  targetDurationSeconds?: number;
                  notes?: string;
                  supersetWith?: string;
                }>;
              }>
            ).map((s) => ({
              name: s.name,
              dayOfWeek: s.dayOfWeek ?? null,
              exercises: s.exercises.map((e) => ({
                name: e.name,
                targetSets: e.targetSets,
                targetRepMin: e.targetRepMin,
                targetRepMax: e.targetRepMax,
                targetDurationSeconds: e.targetDurationSeconds,
                notes: e.notes,
                supersetWith: e.supersetWith,
              })),
            })),
            weeklyVolumeSummary: args.weeklyVolumeSummary as {
              totalSets: number;
              muscleGroupBreakdown: Record<string, number>;
            },
            recommendations: args.recommendations as string[],
            experienceLevel: args.experienceLevel as ExperienceLevel,
          };
          resultText = `Program "${args.programName}" generated successfully with ${(args.sessions as unknown[]).length} sessions.`;
          break;
        }

        default:
          resultText = `Unknown function: ${functionName}`;
      }

      conversation.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify({ result: resultText }),
      });
    }

    // If the model already produced the final program, we can stop now —
    // no need to round-trip another turn just to hear "done."
    if (program) {
      break;
    }
  }

  if (!program) {
    throw new Error('AI did not generate a program. Please try again.');
  }

  return {
    program,
    exercisesToCreate,
    selectedExercises,
    inferredExperienceLevel,
  };
}
