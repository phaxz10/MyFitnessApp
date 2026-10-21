import { hasToolCall, tool } from 'ai';
import { z } from 'zod';
import { ALWAYS_AVAILABLE_EQUIPMENT } from '../../constants/equipment';
import type {
  AIExerciseResponse,
  AIProgramGeneratorInputV2,
  AIProgramGeneratorResponse,
  AIProgramOptimizationInput,
  Exercise,
  ExperienceLevel,
  ExperienceLevelInference,
} from '../../types';
import { complete, respond } from '../ai/aiClient';

// No web search for programming: the evidence-based guidance is written into
// the prompts below, and ':online' is billed per request.

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

// muscleGroupBreakdown is an array of {muscleGroup, sets} rather than a
// record because OpenAI's strict structured-output mode rejects objects
// with arbitrary keys (additionalProperties must be false). The array is
// flattened back into a Record<string, number> in normalizeProgramResponse.
const programResponseSchema = z.object({
  programName: z.string(),
  programDescription: z.string(),
  sessions: z.array(generatedSessionSchema),
  weeklyVolumeSummary: z.object({
    totalSets: z.number(),
    muscleGroupBreakdown: z.array(
      z.object({
        muscleGroup: z.string(),
        sets: z.number(),
      }),
    ),
  }),
  recommendations: z.array(z.string()),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']).nullable(),
});

type RawProgramResponse = z.infer<typeof programResponseSchema>;

export function normalizeProgramResponse(
  response: RawProgramResponse,
): AIProgramGeneratorResponse {
  const muscleGroupBreakdown: Record<string, number> = {};
  for (const { muscleGroup, sets } of response.weeklyVolumeSummary
    .muscleGroupBreakdown) {
    const trimmed = muscleGroup.trim();
    if (!trimmed) continue;
    muscleGroupBreakdown[trimmed] = (muscleGroupBreakdown[trimmed] ?? 0) + sets;
  }

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
    weeklyVolumeSummary: {
      totalSets: response.weeklyVolumeSummary.totalSets,
      muscleGroupBreakdown,
    },
    recommendations: response.recommendations,
    experienceLevel: response.experienceLevel ?? undefined,
  };
}

// Zod input schemas for the three function tools used by
// generateWorkoutProgramWithFunctionCalling. Defined here so the tool factory
// (built per call to close over the accumulators) stays tight.
const selectExercisesInput = z.object({
  selections: z.array(
    z.object({
      exercise_name: z.string(),
      reason: z.string().optional(),
    }),
  ),
});

const createExercisesInput = z.object({
  exercises: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      muscle_groups: z.array(z.string()),
      equipment: z.string(),
      exercise_type: z.enum([
        'reps_weight',
        'reps_only',
        'duration',
        'duration_weight',
      ]),
      tips: z.array(z.string()),
    }),
  ),
});

const generateProgramExerciseInput = z.object({
  name: z.string(),
  targetSets: z.number(),
  targetRepMin: z.number(),
  targetRepMax: z.number(),
  targetDurationSeconds: z.number().optional(),
  notes: z.string().optional(),
  supersetWith: z.string().optional(),
});

const generateProgramInput = z.object({
  programName: z.string(),
  programDescription: z.string(),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']),
  sessions: z.array(
    z.object({
      name: z.string(),
      dayOfWeek: z.number().nullable().optional(),
      sessionTimeMinutes: z.number().optional(),
      exercises: z.array(generateProgramExerciseInput),
    }),
  ),
  weeklyVolumeSummary: z.object({
    totalSets: z.number(),
    muscleGroupBreakdown: z.record(z.string(), z.number()),
  }),
  recommendations: z.array(z.string()),
});

// ============================================================================
// optimizeWorkoutProgram — single-turn optimization
// ============================================================================

const OPTIMIZE_INSTRUCTIONS = `You are an expert strength and conditioning coach. Optimize the user's existing workout program for progression, recovery, and balanced weekly volume while honoring equipment, injuries, and time constraints.

The user message lists the PROFILE, PREFERENCES, CURRENT PROGRAM, RECENT PERFORMANCE, WEEKLY VOLUME and an EXERCISE LIBRARY.
Line formats: program exercises are "name|type|sets|reps|duration|muscles|equipment|notes"; library lines are "name|type|muscles|equipment"; performance lines are "name|last performed|avg kg×reps|max kg×reps|volume|sessions".

EXERCISE LIBRARY RULE: you MUST use ONLY exercise names from the EXERCISE LIBRARY (case-insensitive match). The app rejects any exercise name that does not appear verbatim in the library. If you want an exercise that's not in the library, pick the closest existing one instead — do not invent new names.

TASKS:
1. Keep the program structure similar, but improve exercise selection, volume balance, and progression ranges.
2. Ensure weekly volume matches the goal and experience level.
3. Respect injuries/limitations and equipment constraints.
4. Maintain or improve exercise ordering (compounds first, accessories later).
5. Use supersets when it improves efficiency, but avoid overloading fatigue. Paired exercises reference each other in "supersetWith".
6. Keep session duration within the preferred limit.
7. CRITICAL: every "name" field in your output must be a verbatim copy of an exercise name from the library. Do not paraphrase, abbreviate, or add qualifiers.

Output: a JSON object matching the provided schema. weeklyVolumeSummary.muscleGroupBreakdown is a list of {muscleGroup, sets}; use null for fields that do not apply (targetDurationSeconds on rep exercises, empty notes, no superset).`;

const MAX_OPTIMIZE_LIBRARY = 120;
const MIN_OPTIMIZE_ALTERNATIVES = 15;
const GENERIC_EQUIPMENT_WORDS = new Set([
  'machine',
  'and',
  'or',
  'with',
  'station',
  'none',
]);

function equipmentTokens(value: string | null | undefined): string[] {
  return (value ?? '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 1 && !GENERIC_EQUIPMENT_WORDS.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
}

function splitList(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Library entries worth showing the optimizer: exercises already in the
 * program, plus ones that train a muscle group the program trains AND use
 * equipment the user has (or that the program already uses). Exported for
 * tests.
 */
export function selectRelevantLibrary(
  input: Pick<
    AIProgramOptimizationInput,
    'program' | 'exerciseLibrary' | 'preferences'
  >,
): AIProgramOptimizationInput['exerciseLibrary'] {
  const programExercises = input.program.sessions.flatMap((s) => s.exercises);
  const inProgram = new Set(programExercises.map((e) => e.name.toLowerCase()));
  const muscles = new Set(
    programExercises.flatMap((e) => splitList(e.muscle_groups)),
  );
  for (const area of input.preferences.focusAreas) {
    muscles.add(area.toLowerCase());
  }
  // Equipment is free text in the library ("Dumbbells", "Barbell and
  // bench"), so match on words rather than exact strings.
  const equipmentWords = new Set(
    [
      ...ALWAYS_AVAILABLE_EQUIPMENT,
      ...input.preferences.availableEquipment,
      ...programExercises.map((e) => e.equipment),
    ].flatMap(equipmentTokens),
  );
  const equipmentOk = (value: string) => {
    const words = equipmentTokens(value);
    return words.length === 0 || words.some((w) => equipmentWords.has(w));
  };
  const trainsProgramMuscle = (value: string) =>
    splitList(value).some((m) => muscles.has(m));

  const current = input.exerciseLibrary.filter((ex) =>
    inProgram.has(ex.name.toLowerCase()),
  );
  const others = input.exerciseLibrary.filter(
    (ex) => !inProgram.has(ex.name.toLowerCase()),
  );
  let relevant = others.filter(
    (ex) => trainsProgramMuscle(ex.muscle_groups) && equipmentOk(ex.equipment),
  );
  // Too few alternatives (sparse metadata) — widen rather than starve the
  // optimizer of options.
  if (relevant.length < MIN_OPTIMIZE_ALTERNATIVES) {
    const muscleOnly = others.filter((ex) =>
      trainsProgramMuscle(ex.muscle_groups),
    );
    relevant =
      muscleOnly.length >= MIN_OPTIMIZE_ALTERNATIVES ? muscleOnly : others;
  }
  return [...current, ...relevant].slice(0, MAX_OPTIMIZE_LIBRARY);
}

export async function optimizeWorkoutProgram(
  input: AIProgramOptimizationInput,
): Promise<AIProgramGeneratorResponse> {
  const formattedProgram = input.program.sessions
    .map((session) => {
      const exercises = session.exercises
        .map(
          (e) =>
            `${e.name}|${e.exercise_type}|${e.targetSets}|${e.targetRepMin ?? '-'}-${e.targetRepMax ?? '-'}|${e.targetDurationSeconds ?? '-'}s|${e.muscle_groups}|${e.equipment}|${e.notes ?? ''}`,
        )
        .join('\n');
      return `Session: ${session.name} (day: ${session.dayOfWeek ?? 'flex'})\n${exercises}`;
    })
    .join('\n\n');

  const exerciseLibrary = selectRelevantLibrary(input)
    .map(
      (e) => `${e.name}|${e.exercise_type}|${e.muscle_groups}|${e.equipment}`,
    )
    .join('\n');

  const programNames = new Set(
    input.program.sessions.flatMap((s) =>
      s.exercises.map((e) => e.name.toLowerCase()),
    ),
  );
  const performanceSummary = input.performanceSummary
    .filter((s) => programNames.has(s.exerciseName.toLowerCase()))
    .map(
      (s) =>
        `${s.exerciseName}|${s.lastPerformed ?? 'n/a'}|${s.avgWeight ?? '-'}×${s.avgReps ?? '-'}|${s.maxWeight ?? '-'}×${s.maxReps ?? '-'}|${s.totalVolume ?? '-'}|${s.totalSessions}`,
    )
    .join('\n');

  const prompt = `PROFILE:
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

RECENT PERFORMANCE:
${performanceSummary || 'No recent workout history available'}

WEEKLY VOLUME:
- Total sets: ${input.weeklyVolumeSummary.totalSets}
- By muscle group: ${Object.entries(
    input.weeklyVolumeSummary.muscleGroupBreakdown,
  )
    .map(([muscle, sets]) => `${muscle}: ${sets}`)
    .join(', ')}

EXERCISE LIBRARY:
${exerciseLibrary || 'No library data'}`;

  const response = await complete({
    instructions: OPTIMIZE_INSTRUCTIONS,
    prompt,
    schema: programResponseSchema,
    schemaName: 'workout_program',
    reasoning: 'medium',
  });

  return normalizeProgramResponse(response);
}

// ============================================================================
// Experience level — computed locally. The criteria are fixed thresholds, so
// asking a model to apply them was a paid call with nothing to reason about.
// ============================================================================

export interface WorkoutHistorySummary {
  totalWorkouts: number;
  totalWeeks: number;
  avgExercisesPerSession: number;
  avgSetsPerSession: number;
  hasUsedSupersets: boolean;
  topExercises: string[];
}

/**
 * BEGINNER: < 50 workouts OR < 12 weeks. ADVANCED: > 200 workouts AND > 36
 * weeks. Otherwise INTERMEDIATE. Same thresholds the old AI prompt applied.
 */
export function inferExperienceLevelLocally(
  history: WorkoutHistorySummary,
): ExperienceLevelInference {
  const totalWorkouts = Number(history.totalWorkouts) || 0;
  const totalWeeks = Number(history.totalWeeks) || 0;
  const avgSets = Number(history.avgSetsPerSession) || 0;

  let inferredLevel: ExperienceLevel;
  if (totalWorkouts < 50 || totalWeeks < 12) inferredLevel = 'beginner';
  else if (totalWorkouts > 200 && totalWeeks > 36) inferredLevel = 'advanced';
  else inferredLevel = 'intermediate';

  // Confidence reflects how much data there is and how far from a boundary.
  const nearBoundary =
    Math.abs(totalWorkouts - 50) < 10 ||
    Math.abs(totalWorkouts - 200) < 25 ||
    Math.abs(totalWeeks - 12) < 2 ||
    Math.abs(totalWeeks - 36) < 4;
  const confidence: ExperienceLevelInference['confidence'] =
    totalWorkouts < 10 ? 'low' : nearBoundary ? 'medium' : 'high';

  const reasoning = `${totalWorkouts} completed workouts over ${totalWeeks} weeks, averaging ${avgSets.toFixed(
    1,
  )} sets per session${history.hasUsedSupersets ? ' with supersets' : ''}. ${
    inferredLevel === 'beginner'
      ? 'Under 50 workouts or 12 weeks of training indicates a beginner.'
      : inferredLevel === 'advanced'
        ? 'Over 200 workouts across more than 36 weeks indicates an advanced lifter.'
        : 'Between the beginner and advanced thresholds indicates an intermediate lifter.'
  }`;

  return {
    inferredLevel,
    confidence,
    reasoning,
    metrics: {
      totalWorkouts,
      averageVolumePerSession: Math.round(avgSets * 10) / 10,
      exerciseVariety: history.topExercises.length,
      trainingConsistencyWeeks: totalWeeks,
      hasProgressiveOverload: false,
    },
  };
}

// ============================================================================
// MULTI-TURN ORCHESTRATION via function calling.
//
// The AI gets 3 tools and orchestrates the workflow itself:
//   1. select_exercises (from existing library — prefer reuse)
//   2. create_exercises (only for gaps)
//   3. generate_program (final assembly with supersets)
// Experience level is resolved locally beforehand (inferExperienceLevelLocally).
//
// The loop stops the moment generate_program is called (hasToolCall), with a
// 10-step cap as a fallback, so there is no extra round trip just to hear
// "done".

export interface StreamlinedProgramResult {
  program: AIProgramGeneratorResponse;
  exercisesToCreate: AIExerciseResponse[];
  selectedExercises: { name: string; reason?: string }[];
  inferredExperienceLevel?: ExperienceLevelInference;
}

/**
 * Generates a workout program using function calling.
 * The AI orchestrates: experience inference (if needed), exercise selection
 * from the library, creation of any missing exercises, and final program
 * assembly — all in a single tool-calling conversation.
 */
export async function generateWorkoutProgramWithFunctionCalling(
  input: AIProgramGeneratorInputV2,
  existingExercises: Exercise[],
): Promise<StreamlinedProgramResult> {
  const allEquipment = [
    ...ALWAYS_AVAILABLE_EQUIPMENT,
    ...input.availableEquipment,
  ];

  // Compact "name|type|equipment" lines: names carry the movement and
  // muscle; equipment is kept because the program must respect it.
  const existingExercisesList = existingExercises
    .slice(0, 150)
    .map((ex) => `${ex.name}|${ex.exercise_type}|${ex.equipment ?? ''}`)
    .join('\n');

  const splitPreference = formatSplitPreference(input.preferredTrainingSplit);

  // Experience level is resolved by the caller (user choice, or computed
  // locally from history); intermediate is the no-data default.
  const experienceLevel: ExperienceLevel =
    input.experienceLevel ??
    (input.workoutHistory
      ? inferExperienceLevelLocally(input.workoutHistory).inferredLevel
      : 'intermediate');
  const experienceContext = input.experienceLevel
    ? `Experience Level: ${experienceLevel} (user-provided)`
    : input.workoutHistory
      ? `Experience Level: ${experienceLevel} (from ${input.workoutHistory.totalWorkouts} logged workouts over ${input.workoutHistory.totalWeeks} weeks; uses supersets: ${input.workoutHistory.hasUsedSupersets ? 'yes' : 'no'})`
      : 'Experience Level: intermediate (default, no history available)';

  const systemPrompt = `You are an expert strength and conditioning coach creating a personalized workout program using BuiltWithScience evidence-based principles.

AVAILABLE FUNCTIONS:
1. select_exercises - Select exercises from the user's existing library
2. create_exercises - Create new exercises that don't exist in the library
3. generate_program - Generate the complete workout program

WORKFLOW:
1. Review the exercise library (lines are "name|type|equipment") and call select_exercises for exercises you want to use
2. If you need exercises not in the library, call create_exercises to add them
3. Finally, call generate_program with the complete program structure — this ends the conversation, so call it last and only once

=== EXERCISE TYPE CLASSIFICATION (REQUIRED for create_exercises) ===

When calling create_exercises, you MUST pick the correct exercise_type per exercise.
Misclassifying breaks the workout UI (e.g. a Plank stored as reps_weight forces the user to enter weight/reps instead of starting a timer).

Pick exactly one:

- "reps_weight" — performed for reps WITH external load. The user logs weight × reps.
    Examples: Bench Press, Squat, Bicep Curl, Cable Row, Lat Pulldown, Overhead Press, Romanian Deadlift, Hip Thrust, Leg Press

- "reps_only" — performed for reps with NO external load (bodyweight / band). The user logs reps only.
    Examples: Push-Up, Pull-Up, Chin-Up, Air Squat, Dip, Burpee, Sit-Up, Bodyweight Lunge, Inverted Row

- "duration" — HELD or PERFORMED FOR TIME, no external weight. The user starts a timer.
    Examples: Plank, Side Plank, Wall Sit, Dead Hang, Hollow Hold, Superman Hold, L-Sit, Glute Bridge Hold

- "duration_weight" — held for time WITH external weight. Timer plus weight input.
    Examples: Weighted Plank, Farmer's Carry, Suitcase Carry, Yoke Walk, Weighted Dead Hang

Rule of thumb: if the goal of the exercise is to hold a position or carry a load (not perform repetitions), it's duration / duration_weight. If you would naturally count reps, it's reps_only or reps_weight depending on whether weight is loaded.

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
1. Select exercises from the library that fit the program
2. Create any additional exercises needed (minimize new exercises if library has good options)
3. Generate the complete program with proper superset pairings for ${experienceLevel} level
4. APPLY GENDER-SPECIFIC GUIDELINES above for exercise selection and volume distribution

Remember: ALWAYS pair supersets bidirectionally. If Bicep Curls superset with Tricep Pushdowns, BOTH exercises must reference each other.`;

  // Accumulators closed over by the tool execute callbacks. The Vercel SDK
  // drives the multi-step loop: it calls a tool, feeds the result back to the
  // model, and continues until stopWhen says stop.
  const inferredExperienceLevel =
    !input.experienceLevel && input.workoutHistory
      ? inferExperienceLevelLocally(input.workoutHistory)
      : undefined;
  const selectedExercises: { name: string; reason?: string }[] = [];
  const exercisesToCreate: AIExerciseResponse[] = [];
  let program: AIProgramGeneratorResponse | null = null;

  const tools = {
    select_exercises: tool({
      description:
        'Select exercises from the existing library to use in the program. Always prefer existing exercises over creating new ones.',
      inputSchema: selectExercisesInput,
      execute: async (args) => {
        for (const sel of args.selections) {
          selectedExercises.push({
            name: sel.exercise_name,
            reason: sel.reason,
          });
        }
        return `Selected ${args.selections.length} exercises from library: ${args.selections
          .map((s) => s.exercise_name)
          .join(', ')}`;
      },
    }),
    create_exercises: tool({
      description:
        'Create new exercises in the user exercise library. Call this when the program requires exercises that do not exist in the library.',
      inputSchema: createExercisesInput,
      execute: async (args) => {
        for (const ex of args.exercises) {
          exercisesToCreate.push(ex);
        }
        return `Queued ${args.exercises.length} new exercises for creation: ${args.exercises
          .map((e) => e.name)
          .join(', ')}`;
      },
    }),
    generate_program: tool({
      description:
        'Generate a complete workout program with sessions and exercises. Call this after selecting/creating all needed exercises.',
      inputSchema: generateProgramInput,
      execute: async (args) => {
        program = {
          programName: args.programName,
          programDescription: args.programDescription,
          sessions: args.sessions.map((s) => ({
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
          weeklyVolumeSummary: args.weeklyVolumeSummary,
          recommendations: args.recommendations,
          experienceLevel: args.experienceLevel as ExperienceLevel,
        };
        return `Program "${args.programName}" generated successfully with ${args.sessions.length} sessions.`;
      },
    }),
  };

  // stopWhen short-circuits the loop the moment generate_program fires —
  // no extra round-trip just to hear "done." The 10-step cap is a fallback
  // if the model never calls generate_program.
  await respond({
    instructions: systemPrompt,
    prompt: userPrompt,
    tools,
    maxSteps: 10,
    stopWhen: hasToolCall('generate_program'),
    reasoning: 'medium',
  });

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
