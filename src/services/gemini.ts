import type { FunctionDeclaration } from '@google/genai';
import {
  createPartFromFunctionResponse,
  FunctionCallingConfigMode,
  GoogleGenAI,
  ThinkingLevel,
  Type,
} from '@google/genai';
import { ALWAYS_AVAILABLE_EQUIPMENT } from '../constants/equipment';
import type {
  AIExerciseCoachingResponse,
  AIExerciseResponse,
  AIFoodAnalysisResponse,
  AIGoalReviewResponse,
  AIProgramGeneratorInput,
  AIProgramGeneratorInputV2,
  AIProgramGeneratorResponse,
  AIProgramOptimizationInput,
  AITargetResponse,
  AIWeeklyReviewResponse,
  Exercise,
  ExperienceLevel,
  ExperienceLevelInference,
  UserProfile,
  WeeklyReviewData,
  WeightLog,
  WorkoutSet,
} from '../types';
import { calculateAgeFromBirthdate } from '../utils/date';

// ============================================================================
// FUNCTION DECLARATIONS FOR GEMINI FUNCTION CALLING
// ============================================================================

const createExercisesFunctionDeclaration: FunctionDeclaration = {
  name: 'create_exercises',
  description:
    'Create new exercises in the user exercise library. Call this when the program requires exercises that do not exist in the library.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      exercises: {
        type: Type.ARRAY,
        description: 'List of exercises to create',
        items: {
          type: Type.OBJECT,
          properties: {
            name: {
              type: Type.STRING,
              description: 'Standard exercise name',
            },
            description: {
              type: Type.STRING,
              description:
                'Step-by-step guide for performing the exercise (3-5 sentences)',
            },
            muscle_groups: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description:
                'Primary and secondary muscle groups (e.g., ["Chest", "Triceps"])',
            },
            equipment: {
              type: Type.STRING,
              description: 'Required equipment (or "Bodyweight" if none)',
            },
            exercise_type: {
              type: Type.STRING,
              enum: ['reps_weight', 'reps_only', 'duration', 'duration_weight'],
              description: 'Type of exercise tracking',
            },
            tips: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
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

const selectExercisesFunctionDeclaration: FunctionDeclaration = {
  name: 'select_exercises',
  description:
    'Select exercises from the existing library to use in the program. Always prefer existing exercises over creating new ones.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      selections: {
        type: Type.ARRAY,
        description: 'List of exercise selections from the library',
        items: {
          type: Type.OBJECT,
          properties: {
            exercise_name: {
              type: Type.STRING,
              description: 'Exact name of the exercise from the library',
            },
            reason: {
              type: Type.STRING,
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

const generateProgramFunctionDeclaration: FunctionDeclaration = {
  name: 'generate_program',
  description:
    'Generate a complete workout program with sessions and exercises. Call this after selecting/creating all needed exercises.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      programName: {
        type: Type.STRING,
        description: 'Descriptive name for the program',
      },
      programDescription: {
        type: Type.STRING,
        description: '2-3 sentence program overview',
      },
      experienceLevel: {
        type: Type.STRING,
        enum: ['beginner', 'intermediate', 'advanced'],
        description: 'Inferred or confirmed experience level',
      },
      sessions: {
        type: Type.ARRAY,
        description: 'List of workout sessions',
        items: {
          type: Type.OBJECT,
          properties: {
            name: {
              type: Type.STRING,
              description: 'Session name (e.g., "Push Day", "Upper Body A")',
            },
            dayOfWeek: {
              type: Type.NUMBER,
              description:
                'Day of week (0=Sunday through 6=Saturday), or null for flexible',
            },
            sessionTimeMinutes: {
              type: Type.NUMBER,
              description: 'Estimated session duration',
            },
            exercises: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: {
                    type: Type.STRING,
                    description:
                      'Exercise name (must match library or created)',
                  },
                  targetSets: {
                    type: Type.NUMBER,
                    description: 'Number of sets (typically 2-4)',
                  },
                  targetRepMin: {
                    type: Type.NUMBER,
                    description:
                      'Minimum reps (can be 4-30+ depending on exercise type)',
                  },
                  targetRepMax: {
                    type: Type.NUMBER,
                    description:
                      'Maximum reps (lateral raises: 15-25, calves: 20-30, compounds: 6-10)',
                  },
                  targetDurationSeconds: {
                    type: Type.NUMBER,
                    description: 'For duration-based exercises (planks, holds)',
                  },
                  notes: {
                    type: Type.STRING,
                    description:
                      'Form cue, intensity technique (e.g., "Rest-pause: 12 reps + 15 sec + max reps", "Slow 3 sec eccentric", "Drop set on final set")',
                  },
                  supersetWith: {
                    type: Type.STRING,
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
        type: Type.OBJECT,
        properties: {
          totalSets: { type: Type.NUMBER },
          muscleGroupBreakdown: {
            type: Type.OBJECT,
            description:
              'Sets per muscle group (e.g., {"Chest": 12, "Back": 14})',
          },
        },
        required: ['totalSets', 'muscleGroupBreakdown'],
      },
      recommendations: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
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

const inferExperienceLevelFunctionDeclaration: FunctionDeclaration = {
  name: 'infer_experience_level',
  description:
    'Infer the user experience level based on their workout history. Call this if experience level is not provided.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      inferredLevel: {
        type: Type.STRING,
        enum: ['beginner', 'intermediate', 'advanced'],
        description: 'Inferred experience level',
      },
      confidence: {
        type: Type.STRING,
        enum: ['low', 'medium', 'high'],
        description: 'Confidence in the inference',
      },
      reasoning: {
        type: Type.STRING,
        description: 'Explanation of why this level was inferred',
      },
    },
    required: ['inferredLevel', 'confidence', 'reasoning'],
  },
};

let ai: GoogleGenAI | null = null;

const MODEL = 'gemini-3-flash-preview';

export function initGemini(apiKey: string): void {
  ai = new GoogleGenAI({ apiKey });
}

export function isGeminiInitialized(): boolean {
  return ai !== null;
}

// Helper to clean JSON response from AI
function cleanJsonResponse(text: string): string {
  return text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
}

// Analyze food from text description
export async function analyzeFoodText(
  foodDescription: string,
): Promise<AIFoodAnalysisResponse> {
  if (!ai) throw new Error('Gemini API not initialized');

  const prompt = `Analyze the following food description and look up on the internet for nutritional information.
Return JSON format only, no markdown code blocks.

Food: ${foodDescription}

Return format:
{
  "items": [
    {
      "name": "food item name",
      "portion_grams": grams,
      "calories": calories,
      "protein_g": protein,
      "carbs_g": carbs,
      "fat_g": fat
    }
  ],
  "total": {
    "calories": total_calories,
    "protein_g": total_protein,
    "carbs_g": total_carbs,
    "fat_g": total_fat
  }
}`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      temperature: 1,
      tools: [{ googleSearch: {} }],
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.LOW,
        includeThoughts: false,
      },
    },
  });

  const text = response.text ?? '';
  return JSON.parse(cleanJsonResponse(text)) as AIFoodAnalysisResponse;
}

// Analyze food from image with optional text description
export async function analyzeFoodImage(
  imageBase64: string,
  mimeType: string,
  textDescription?: string,
): Promise<AIFoodAnalysisResponse> {
  if (!ai) throw new Error('Gemini API not initialized');

  const prompt = `Analyze this food image and use the internet to search for the nutrient values, if not found the exact values estimate nutritional information. please throw error if the image is not food.
${textDescription ? `Additional context from user: ${textDescription}` : ''}

All portions should be estimated in grams.

Return JSON format only, no markdown code blocks:
{
  "items": [
    {
      "name": "identified food item",
      "portion_grams": estimated_grams,
      "calories": estimated_calories,
      "protein_g": estimated_protein,
      "carbs_g": estimated_carbs,
      "fat_g": estimated_fat
    }
  ],
  "total": {
    "calories": total_calories,
    "protein_g": total_protein,
    "carbs_g": total_carbs,
    "fat_g": total_fat
  }
}`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      { text: prompt },
      {
        inlineData: {
          mimeType,
          data: imageBase64,
        },
      },
    ],
    config: {
      temperature: 1,
      tools: [{ googleSearch: {} }],
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.LOW,
        includeThoughts: false,
      },
    },
  });

  const text = response.text ?? '';
  return JSON.parse(cleanJsonResponse(text)) as AIFoodAnalysisResponse;
}

// Valid muscle group categories for filtering
const MUSCLE_GROUP_CATEGORIES = [
  'Chest',
  'Upper Chest',
  'Mid Chest',
  'Lower Chest',
  'Back',
  'Upper Back',
  'Mid Back',
  'Lower Back',
  'Shoulders',
  'Front Shoulders',
  'Side Shoulders',
  'Rear Shoulders',
  'Arms',
  'Biceps',
  'Triceps',
  'Forearms',
  'Legs',
  'Quads',
  'Hamstrings',
  'Calves',
  'Glutes',
  'Upper Glutes',
  'Lower Glutes',
  'Core',
  'Upper Abs',
  'Lower Abs',
  'Obliques',
  'Full Body',
] as const;

function buildExerciseDetailsPrompt(exerciseNames: string[]): string {
  const isBatch = exerciseNames.length > 1;
  const exerciseList = exerciseNames
    .map((name, index) => `${index + 1}. ${name}`)
    .join('\n');
  const intro = isBatch
    ? `You are a certified personal trainer and exercise science expert. Generate comprehensive exercise details for the following exercises:\n\n${exerciseList}`
    : `You are a certified personal trainer and exercise science expert. Generate comprehensive exercise details for: "${exerciseNames[0]}"`;
  const responseShape = `[
  {
    "name": "standardized exercise name",
    "description": "A comprehensive step-by-step guide on how to perform this exercise. Include: starting position, movement execution (concentric and eccentric phases), and end position. Be specific about body positioning, grip, stance, and range of motion.",
    "muscle_groups": ["Primary category", "Secondary category"],
    "equipment": "required equipment (or 'Bodyweight' if none)",
    "exercise_type": "reps_weight|reps_only|duration|duration_weight",
    "tips": [
      "Form cue or technique tip",
      "Common mistake to avoid",
      "Breathing instruction (e.g., 'Exhale during the lift, inhale on the descent')",
      "Safety consideration",
      "Progression or variation tip"
    ]
  }
]`;

  return `${intro}

Provide detailed, actionable information that helps someone perform this exercise safely and effectively.

IMPORTANT: For muscle_groups, you MUST ONLY use values from this list: ${MUSCLE_GROUP_CATEGORIES.join(', ')}
- Map anatomical terms to these categories, using simple region cues to pick the best category (upper/mid/lower chest or back, front/side/rear shoulders, quads/hamstrings/calves for legs, upper/lower abs or obliques for core, upper/lower glutes). Example mappings: "Pectoralis Major" -> "Chest", "Latissimus Dorsi" -> "Back", "Quadriceps" -> "Quads", "Hamstrings" -> "Hamstrings", "Deltoids" -> "Shoulders", "Abdominals" -> "Core", "Obliques" -> "Core", "Gluteus Maximus/Med" -> "Glutes", "Calves" -> "Calves"
- List primary muscle group first
- For exercises targeting arms, also include triceps or biceps or both as applicable
- For compound movements targeting many areas, you can include "Full Body"

IMPORTANT: For exercise_type, determine which type this exercise is:
- "reps_weight": Exercise performed with reps and external weight (e.g., Bench Press, Squat, Bicep Curl)
- "reps_only": Exercise performed with reps but no weight (e.g., Pull-ups, Push-ups, Air Squats)
- "duration": Exercise held for time without weight (e.g., Plank, Dead Hang, Wall Sit)
- "duration_weight": Exercise held for time with weight (e.g., Weighted Plank, Farmer's Carry)

Return JSON format only, no markdown code blocks:
${responseShape}

Guidelines:
- Description should be 3-5 sentences covering the full movement pattern
- Include 4-6 practical tips covering form, breathing, safety, and common errors
- Be specific and actionable - avoid vague instructions
- Use builtwithscience.com publicly available data as reference where applicable${isBatch ? '\n- Return an array with one object per exercise, in the same order as the input list' : ''}`;
}

// Generate exercise details
export async function generateExerciseDetails(
  exerciseName: string,
): Promise<AIExerciseResponse> {
  if (!ai) throw new Error('Gemini API not initialized');

  const prompt = buildExerciseDetailsPrompt([exerciseName]);

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.HIGH,
        includeThoughts: false,
      },
    },
  });

  const text = response.text ?? '';
  return JSON.parse(cleanJsonResponse(text)) as AIExerciseResponse;
}

// Generate details for multiple exercises at once
export async function generateExerciseDetailsBatch(
  exerciseNames: string[],
): Promise<AIExerciseResponse[]> {
  if (!ai) throw new Error('Gemini API not initialized');

  const prompt = buildExerciseDetailsPrompt(exerciseNames);

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.HIGH,
        includeThoughts: false,
      },
    },
  });

  const text = response.text ?? '';
  return JSON.parse(cleanJsonResponse(text)) as AIExerciseResponse[];
}

// Check for potential duplicate exercises using AI
export async function findDuplicateExercises(
  candidateName: string,
  existingExercises: Exercise[],
): Promise<Exercise[]> {
  if (!ai) throw new Error('Gemini API not initialized');

  if (existingExercises.length === 0) return [];

  const list = existingExercises
    .slice(0, 100)
    .map(
      (ex, index) =>
        `${index + 1}. Name: ${ex.name}; Muscles: ${ex.muscle_groups}; Equipment: ${ex.equipment}`,
    )
    .join('\n');

  const prompt = `You are helping manage a personal exercise library.
User wants to add or generate a new exercise with name: "${candidateName}".

Here is the current exercise library (up to 100 items):
${list}

Task:
- Identify any existing exercises that are likely the same exercise or a very close duplicate.
- Focus on name similarity and overlapping muscle groups/equipment.

Return JSON ONLY (no markdown) in this format:
{
  "duplicate_indices": [
    index_numbers_of_potential_duplicates_using_1_based_indices_from_the_list_above
  ]
}`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
  });

  const text = response.text ?? '';

  try {
    const parsed = JSON.parse(cleanJsonResponse(text)) as {
      duplicate_indices?: number[];
    };
    const indices = Array.isArray(parsed.duplicate_indices)
      ? parsed.duplicate_indices.filter((n) => Number.isInteger(n) && n >= 1)
      : [];

    if (indices.length === 0) return [];

    return indices
      .map((i) => existingExercises[i - 1])
      .filter((ex) => ex !== undefined);
  } catch (error) {
    console.error('Failed to parse duplicate exercise response', error, text);
    return [];
  }
}

// Calculate calorie and macro targets
export async function calculateTargets(profile: {
  age: number;
  gender: 'male' | 'female';
  height_cm: number;
  weight_kg: number;
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active';
  goal: 'bulk' | 'lean_bulk' | 'recomp' | 'cut' | 'maintain';
}): Promise<AITargetResponse> {
  if (!ai) throw new Error('Gemini API not initialized');

  const prompt = `Calculate daily calorie and macro targets for:

Profile:
- Age: ${profile.age}
- Gender: ${profile.gender}
- Height: ${profile.height_cm}cm
- Weight: ${profile.weight_kg}kg
- Activity Level: ${profile.activity_level}
- Goal: ${profile.goal}

Provide personalized daily targets considering the goal and sustainable progress. Aim for a reasonable, sustainable rate based on recent progress rather than user-selected targets.

Note:
- Use builtwithscience.com publicly available data as reference where applicable

Return JSON format only, no markdown code blocks:
{
  "calorie_target": daily_calories,
  "protein_g": protein_grams,
  "carbs_g": carb_grams,
  "fat_g": fat_grams,
  "reasoning": "brief explanation of calculation"
}`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.MEDIUM,
        includeThoughts: false,
      },
    },
  });

  const text = response.text ?? '';
  return JSON.parse(cleanJsonResponse(text)) as AITargetResponse;
}

// Review goals and progress
export async function reviewGoals(
  profile: UserProfile,
  weightHistory: WeightLog[],
  avgCalories: number,
  daysLogged: number,
  adherencePct: number,
): Promise<AIGoalReviewResponse> {
  if (!ai) throw new Error('Gemini API not initialized');

  const startWeight = weightHistory.length > 0 ? weightHistory[0].weight_kg : 0;
  const currentWeight =
    weightHistory.length > 0
      ? weightHistory[weightHistory.length - 1].weight_kg
      : 0;
  const weightChange = currentWeight - startWeight;
  const periodDays =
    weightHistory.length > 1
      ? Math.ceil(
          (new Date(weightHistory[weightHistory.length - 1].date).getTime() -
            new Date(weightHistory[0].date).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 0;

  const weightDataSummary = weightHistory
    .slice(-30)
    .map((w) => `${w.date}: ${w.weight_kg}kg`)
    .join('\n');

  const prompt = `Review my fitness progress and provide recommendations.

Current Profile:
- Age: ${calculateAgeFromBirthdate(profile.birthdate)}, Gender: ${profile.gender}, Height: ${profile.height_cm}cm
- Goal: ${profile.goal}
- Current calorie target: ${profile.calorie_target}

Weight History (recent):
${weightDataSummary}

Calorie Adherence:
- Average daily intake: ${avgCalories}
- Days logged: ${daysLogged}
- Target adherence: ${adherencePct}%

Current weight: ${currentWeight}kg
Starting weight: ${startWeight}kg
Weight change: ${weightChange.toFixed(1)}kg over ${periodDays} days

Analyze my progress and provide:
1. Assessment of current progress vs goal
2. Recommended calorie target adjustment (if any)
3. Suggested goal change (if appropriate)
4. Any other recommendations

Note:
- Use builtwithscience.com publicly available data as reference where applicable

Return JSON format only, no markdown code blocks:
{
  "assessment": "text analysis of progress",
  "on_track": true or false,
  "recommendations": {
    "calorie_target": new_target_or_null,
    "protein_g": new_protein_or_null,
    "carbs_g": new_carbs_or_null,
    "fat_g": new_fat_or_null,
    "goal_change": "suggested_goal_or_null",
    "reasoning": "why these changes"
  },
  "program_suggestions": "any workout program advice"
}`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.HIGH,
        includeThoughts: false,
      },
    },
  });

  const text = response.text ?? '';
  return JSON.parse(cleanJsonResponse(text)) as AIGoalReviewResponse;
}

// Weekly progress review for Monday check-in
export async function reviewWeeklyProgress(
  profile: UserProfile,
  weeklyData: WeeklyReviewData,
): Promise<AIWeeklyReviewResponse> {
  if (!ai) throw new Error('Gemini API not initialized');

  const weightDataSummary = weeklyData.weightLogs
    .map(
      (w) =>
        `${w.date}: ${w.weight_kg}kg${w.body_fat_pct ? ` (${w.body_fat_pct}% BF)` : ''}`,
    )
    .join('\n');

  // Calculate expected vs actual weight change for metabolic response analysis
  const dailyDeficitOrSurplus =
    weeklyData.avgDailyCalories - profile.calorie_target;
  const weeklyCalorieDifference = dailyDeficitOrSurplus * 7;
  // 7700 kcal ≈ 1kg of body weight
  const expectedWeeklyWeightChange = weeklyCalorieDifference / 7700;

  const prompt = `You are a fitness coach conducting a weekly check-in review. Analyze the user's past week of progress and provide actionable recommendations.

User Profile:
- Age: ${calculateAgeFromBirthdate(profile.birthdate)}, Gender: ${profile.gender}, Height: ${profile.height_cm}cm
- Current Goal: ${profile.goal}
- Current Calorie Target: ${profile.calorie_target} kcal/day
- Macro Targets: ${profile.protein_target_g}g protein, ${profile.carbs_target_g}g carbs, ${profile.fat_target_g}g fat

Week Summary (${weeklyData.weekStart} to ${weeklyData.weekEnd}):
- Days with weight logged: ${weeklyData.daysWithWeightLog}
- Days with calories logged: ${weeklyData.daysWithCalorieLog}
- Workouts completed: ${weeklyData.totalWorkouts}

Weight Data:
${weightDataSummary || 'No weight logs this week'}
${weeklyData.weightChange !== null ? `Actual weekly weight change: ${weeklyData.weightChange > 0 ? '+' : ''}${weeklyData.weightChange.toFixed(2)}kg` : ''}

Calorie Adherence:
- Average daily intake: ${weeklyData.avgDailyCalories} kcal
- Target: ${profile.calorie_target} kcal
- Adherence: ${weeklyData.calorieAdherence}%
- Weekly calorie difference from target: ${weeklyCalorieDifference > 0 ? '+' : ''}${Math.round(weeklyCalorieDifference)} kcal
- Expected weight change based on intake: ${expectedWeeklyWeightChange > 0 ? '+' : ''}${expectedWeeklyWeightChange.toFixed(2)}kg

METABOLIC RESPONSE ANALYSIS:
Compare actual weight change vs expected weight change to assess metabolic adaptation:

"Thrifty" Metabolic Response (signs of metabolic adaptation):
- Weight loss is SLOWER than expected despite calorie deficit
- Or weight gain is FASTER than expected on small surplus
- Body is conserving energy, reducing NEAT (non-exercise activity thermogenesis)
- Common after prolonged dieting or multiple cut cycles
- Recommendation: Consider diet break, reverse diet, or increase calories slightly to restore metabolic rate

"Spendthrift" Metabolic Response (metabolically flexible):
- Weight changes roughly match expected rates based on calorie intake
- Body responds predictably to calorie adjustments
- Good metabolic flexibility - continue current approach

"Hyper-Spendthrift" Response (rare):
- Weight loss is FASTER than expected
- Or difficulty gaining weight despite surplus
- High metabolic rate, body "wastes" excess energy as heat
- May need larger surplus for bulking goals

Based on this data, provide a comprehensive weekly review. Consider:
1. Is the user on track for their ${profile.goal} goal?
2. Analyze their metabolic response: Is their body responding as expected to their calorie intake, or showing signs of metabolic adaptation (thrifty) or high metabolism (spendthrift)?
3. Should they update body measurements (weight, body fat)? Recommend this if no recent measurements or if significant weight change detected.
4. Should calorie targets be adjusted? Consider:
   - If showing "thrifty" response during a cut: may need a diet break or slight calorie increase
   - If showing "thrifty" response during bulk: current calories may be sufficient
   - If showing "spendthrift" response: continue current approach or adjust based on goals
5. Should the goal be changed? (e.g., cut -> maintenance for diet break if metabolically adapted)
6. Are there any workout/program adjustments needed?

Return JSON format only, no markdown code blocks:
{
  "summary": "2-3 sentence overview of the week's progress",
  "onTrack": true/false,
  "metabolicResponse": {
    "type": "thrifty|normal|spendthrift",
    "analysis": "explanation of how body is responding to current calorie intake vs expected",
    "recommendation": "specific advice based on metabolic response"
  },
  "progressAssessment": {
    "weightProgress": "assessment of weight trend vs goal",
    "calorieAdherence": "assessment of calorie tracking consistency",
    "workoutConsistency": "assessment of workout frequency"
  },
  "recommendations": {
    "updateMeasurements": true/false,
    "measurementsReason": "why measurements should be updated, or null",
    "adjustCalories": true/false,
    "newCalorieTarget": new_target_number_or_null,
    "newProteinTarget": new_protein_or_null,
    "newCarbsTarget": new_carbs_or_null,
    "newFatTarget": new_fat_or_null,
    "caloriesReason": "explanation for calorie adjustment including metabolic response considerations, or null",
    "dietBreakRecommended": true/false,
    "dietBreakReason": "if thrifty response detected during cut, explain benefit of 1-2 week maintenance phase, or null",
    "changeGoal": true/false,
    "suggestedGoal": "bulk|lean_bulk|recomp|cut|maintain" or null,
    "goalReason": "why goal should change, or null",
    "changeProgram": true/false,
    "programSuggestion": "program advice or null"
  },
  "motivationalMessage": "encouraging message tailored to their progress and metabolic situation"
}

Guidelines:
- Be encouraging but honest about metabolic adaptation
- If data shows thrifty response during a cut (weight not dropping despite deficit), suggest:
  * A 1-2 week "diet break" at maintenance calories to restore metabolic rate
  * Slightly increasing calories (100-200) to break through plateau
  * Adding refeed days (1-2 higher carb days per week)
- If data shows spendthrift response, reassure user their metabolism is healthy
- Only suggest goal changes if there's a clear reason (e.g., metabolic adaptation requiring diet break)
- Calorie adjustments should consider metabolic state, not just weight trends
- If data is limited, acknowledge uncertainty but note that consistent logging helps identify metabolic patterns
- Use builtwithscience.com publicly available data as reference where applicable`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.HIGH,
        includeThoughts: false,
      },
    },
  });

  const text = response.text ?? '';
  return JSON.parse(cleanJsonResponse(text)) as AIWeeklyReviewResponse;
}

// Generate a complete workout program based on user preferences
export async function generateWorkoutProgram(
  input: AIProgramGeneratorInput,
  existingExercises: Exercise[],
): Promise<AIProgramGeneratorResponse> {
  if (!ai) throw new Error('Gemini API not initialized');

  // Combine user equipment with always-available equipment
  const allEquipment = [
    ...ALWAYS_AVAILABLE_EQUIPMENT,
    ...input.availableEquipment,
  ];

  // Build existing exercises reference for the AI
  const existingExercisesList = existingExercises
    .slice(0, 100)
    .map((ex) => `- ${ex.name} (${ex.muscle_groups}, ${ex.equipment})`)
    .join('\n');

  const goalDescriptions: Record<string, string> = {
    bulk: 'Building muscle mass (caloric surplus)',
    lean_bulk: 'Building lean muscle with minimal fat gain',
    recomp: 'Simultaneously building muscle and losing fat',
    cut: 'Losing body fat while preserving muscle',
    maintain: 'Maintaining current physique and strength',
  };

  const splitPreference =
    input.preferredTrainingSplit === 'auto'
      ? 'Choose the most appropriate training split based on the frequency'
      : `Use a ${input.preferredTrainingSplit?.replace(/_/g, ' ')} split`;

  const prompt = `You are an expert strength and conditioning coach using evidence-based programming principles. Create a complete workout program based on these specifications. Use BuiltWithScience-style programming as your primary reference if possible.

USER PREFERENCES:
- Gender: ${input.gender.toUpperCase()}
- Training frequency: ${input.trainingDaysPerWeek} days per week
- Session duration: ${input.sessionDurationMinutes} minutes per session (HARD CAP)
- Experience level: ${input.experienceLevel}
- Goal: ${input.goal} - ${goalDescriptions[input.goal] || input.goal}
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

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.HIGH,
        includeThoughts: false,
      },
    },
  });

  const text = response.text ?? '';
  return JSON.parse(cleanJsonResponse(text)) as AIProgramGeneratorResponse;
}

export async function optimizeWorkoutProgram(
  input: AIProgramOptimizationInput,
): Promise<AIProgramGeneratorResponse> {
  if (!ai) throw new Error('Gemini API not initialized');

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
  "recommendations": ["string"]
}`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.HIGH,
        includeThoughts: false,
      },
    },
  });

  const text = response.text ?? '';
  return JSON.parse(cleanJsonResponse(text)) as AIProgramGeneratorResponse;
}

// Get AI coaching recommendations for exercise progression
export async function getExerciseCoaching(
  exerciseName: string,
  exerciseHistory: { date: string; sets: WorkoutSet[] }[],
  targetRepMin: number,
  targetRepMax: number,
  targetSets: number,
): Promise<AIExerciseCoachingResponse> {
  if (!ai) throw new Error('Gemini API not initialized');

  // Format history for the prompt (weights stored in kg but user uses lbs for display)
  const historyFormatted = exerciseHistory
    .slice(-5) // Last 5 sessions
    .map((session) => {
      const setsStr = session.sets
        .map((s, i) => `Set ${i + 1}: ${s.weight_kg ?? 0}lbs × ${s.reps ?? 0}`)
        .join(', ');
      return `${session.date}: ${setsStr}`;
    })
    .join('\n');

  // Get the most recent session for baseline
  const lastSession = exerciseHistory[exerciseHistory.length - 1];
  const lastSets = lastSession?.sets || [];

  const prompt = `You are an expert strength coach analyzing exercise progression data. Based on the training history, provide recommendations for the next workout.

EXERCISE: ${exerciseName}
TARGET: ${targetSets} sets × ${targetRepMin}-${targetRepMax} reps

RECENT TRAINING HISTORY (most recent last):
${historyFormatted || 'No previous history'}

LAST SESSION SETS:
${lastSets.map((s, i) => `Set ${i + 1}: ${s.weight_kg ?? 0}lbs × ${s.reps ?? 0} reps`).join('\n') || 'No data'}

PROGRESSIVE OVERLOAD PRINCIPLES:
1. If athlete hit the TOP of rep range (${targetRepMax} reps) on all sets with good form → INCREASE weight by 5-10lbs next session
2. If athlete hit MIDDLE of rep range (${Math.floor((targetRepMin + targetRepMax) / 2)} reps) → MAINTAIN weight, focus on adding 1-2 reps
3. If athlete FAILED to hit minimum reps (${targetRepMin}) → DECREASE weight or maintain and focus on form
4. Consider consistency: multiple sessions at same weight hitting high reps = ready to progress
5. Consider fatigue: declining reps across sets is normal, but dramatic drops suggest too heavy

ANALYSIS REQUIRED:
1. Assess the overall trend: Is the athlete progressing, plateauing, or regressing?
2. For EACH set (up to ${targetSets} sets), recommend:
   - Weight direction: increase, maintain, or decrease
   - Rep direction: increase, maintain, or decrease  
   - Suggested weight (in lbs)
   - Suggested reps

Return JSON format only, no markdown code blocks:
{
  "exerciseId": 0,
  "overallTrend": "progressing|plateau|regressing",
  "sets": [
    {
      "setNumber": 1,
      "weight": "increase|maintain|decrease",
      "reps": "increase|maintain|decrease",
      "suggestedWeight": number_in_lbs,
      "suggestedReps": number
    }
  ],
  "coachingTip": "Brief actionable advice for this exercise"
}

RULES:
- Return exactly ${targetSets} sets in the response
- suggestedWeight should be a realistic number based on history (use last weight as baseline)
- suggestedReps should be within the target range (${targetRepMin}-${targetRepMax})
- If no history, suggest conservative starting weights and recommend "maintain" for first session
- Weight increments should be practical: 5lb for upper body, 5-10lb for lower body
- Use builtwithscience.com publicly available data as reference where applicable`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.LOW,
        includeThoughts: false,
      },
    },
  });

  const text = response.text ?? '';
  return JSON.parse(cleanJsonResponse(text)) as AIExerciseCoachingResponse;
}

// ============================================================================
// STREAMLINED PROGRAM GENERATION WITH FUNCTION CALLING
// ============================================================================

export interface StreamlinedProgramResult {
  program: AIProgramGeneratorResponse;
  exercisesToCreate: AIExerciseResponse[];
  selectedExercises: { name: string; reason?: string }[];
  inferredExperienceLevel?: ExperienceLevelInference;
}

/**
 * Generates a workout program using Gemini function calling.
 * This streamlined approach lets the AI:
 * 1. Infer experience level from workout history (if not provided)
 * 2. Select exercises from the existing library
 * 3. Create new exercises as needed
 * 4. Generate the complete program with proper supersets
 *
 * The AI orchestrates the entire flow in a single conversation.
 */
export async function generateWorkoutProgramWithFunctionCalling(
  input: AIProgramGeneratorInputV2,
  existingExercises: Exercise[],
): Promise<StreamlinedProgramResult> {
  if (!ai) throw new Error('Gemini API not initialized');

  // Combine user equipment with always-available equipment
  const allEquipment = [
    ...ALWAYS_AVAILABLE_EQUIPMENT,
    ...input.availableEquipment,
  ];

  // Build existing exercises reference for the AI
  const existingExercisesList = existingExercises
    .slice(0, 150)
    .map(
      (ex) =>
        `- ${ex.name} | Muscles: ${ex.muscle_groups} | Equipment: ${ex.equipment} | Type: ${ex.exercise_type}`,
    )
    .join('\n');

  const goalDescriptions: Record<string, string> = {
    bulk: 'Building muscle mass (caloric surplus)',
    lean_bulk: 'Building lean muscle with minimal fat gain',
    recomp: 'Simultaneously building muscle and losing fat',
    cut: 'Losing body fat while preserving muscle',
    maintain: 'Maintaining current physique and strength',
  };

  const splitPreference =
    input.preferredTrainingSplit === 'auto'
      ? 'Choose the most appropriate training split based on the frequency'
      : `Use a ${input.preferredTrainingSplit?.replace(/_/g, ' ')} split`;

  // Build experience context
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
- Goal: ${input.goal} - ${goalDescriptions[input.goal] || input.goal}
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

  // Define function tools
  const tools = [
    {
      functionDeclarations: [
        inferExperienceLevelFunctionDeclaration,
        selectExercisesFunctionDeclaration,
        createExercisesFunctionDeclaration,
        generateProgramFunctionDeclaration,
      ],
    },
  ];

  // Result collectors
  let inferredExperienceLevel: ExperienceLevelInference | undefined;
  const selectedExercises: { name: string; reason?: string }[] = [];
  const exercisesToCreate: AIExerciseResponse[] = [];
  let program: AIProgramGeneratorResponse | null = null;

  // Start conversation with function calling
  const chat = ai.chats.create({
    model: MODEL,
    config: {
      systemInstruction: systemPrompt,
      tools,
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.AUTO,
        },
      },
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.HIGH,
        includeThoughts: false,
      },
    },
  });

  let response = await chat.sendMessage({ message: userPrompt });

  // Process function calls in a loop
  const maxIterations = 10;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    // Check if we have function calls to process
    const functionCalls = response.functionCalls;
    if (!functionCalls || functionCalls.length === 0) {
      // No more function calls, check if we got a final text response
      break;
    }

    // Process each function call and build function response parts
    const functionResponseParts: ReturnType<
      typeof createPartFromFunctionResponse
    >[] = [];

    for (const call of functionCalls) {
      const functionName = call.name ?? 'unknown';
      const callId = call.id ?? `call_${iterations}_${functionName}`;
      const args = call.args as Record<string, unknown>;

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
              hasProgressiveOverload: false, // Would need more data
            },
          };
          functionResponseParts.push(
            createPartFromFunctionResponse(callId, functionName, {
              result: `Experience level inferred as ${args.inferredLevel}. Proceed with program generation.`,
            }),
          );
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
          functionResponseParts.push(
            createPartFromFunctionResponse(callId, functionName, {
              result: `Selected ${selections.length} exercises from library: ${selections.map((s) => s.exercise_name).join(', ')}`,
            }),
          );
          break;
        }

        case 'create_exercises': {
          const exercises = args.exercises as AIExerciseResponse[];
          for (const ex of exercises) {
            exercisesToCreate.push(ex);
          }
          functionResponseParts.push(
            createPartFromFunctionResponse(callId, functionName, {
              result: `Queued ${exercises.length} new exercises for creation: ${exercises.map((e) => e.name).join(', ')}`,
            }),
          );
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
          functionResponseParts.push(
            createPartFromFunctionResponse(callId, functionName, {
              result: `Program "${args.programName}" generated successfully with ${(args.sessions as unknown[]).length} sessions.`,
            }),
          );
          break;
        }

        default:
          functionResponseParts.push(
            createPartFromFunctionResponse(callId, functionName, {
              result: `Unknown function: ${functionName}`,
            }),
          );
      }
    }

    // Send function results back to continue the conversation
    response = await chat.sendMessage({
      message: functionResponseParts,
    });
  }

  // Validate we got a program
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

/**
 * Infer experience level from workout history using AI analysis.
 */
export async function inferExperienceLevel(workoutHistory: {
  totalWorkouts: number;
  totalWeeks: number;
  avgExercisesPerSession: number;
  avgSetsPerSession: number;
  hasUsedSupersets: boolean;
  topExercises: string[];
  avgWeightProgression?: number;
}): Promise<ExperienceLevelInference> {
  if (!ai) throw new Error('Gemini API not initialized');

  // Safely convert values to numbers and format them
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

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.LOW,
        includeThoughts: false,
      },
    },
  });

  const text = response.text ?? '';
  return JSON.parse(cleanJsonResponse(text)) as ExperienceLevelInference;
}
