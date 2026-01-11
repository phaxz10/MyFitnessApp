import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  AIFoodAnalysisResponse,
  AIExerciseResponse,
  AITargetResponse,
  AIGoalReviewResponse,
  AIWeeklyReviewResponse,
  AIProgramGeneratorInput,
  AIProgramGeneratorResponse,
  UserProfile,
  WeightLog,
  Exercise,
  WeeklyReviewData,
} from '../types';
import { ALWAYS_AVAILABLE_EQUIPMENT } from '../constants/equipment';

let genAI: GoogleGenerativeAI | null = null;

export function initGemini(apiKey: string): void {
  genAI = new GoogleGenerativeAI(apiKey);
}

export function isGeminiInitialized(): boolean {
  return genAI !== null;
}

// Analyze food from text description
export async function analyzeFoodText(
  foodDescription: string,
): Promise<AIFoodAnalysisResponse> {
  if (!genAI) throw new Error('Gemini API not initialized');

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `Analyze the following food description and estimate nutritional information.
Return JSON format only, no markdown code blocks.

Food: ${foodDescription}

Return format:
{
  "items": [
    {
      "name": "food item name",
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

  const result = await model.generateContent(prompt);
  const response = result.response.text();

  // Clean up response - remove markdown code blocks if present
  const cleanedResponse = response
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  return JSON.parse(cleanedResponse) as AIFoodAnalysisResponse;
}

// Analyze food from image with optional text description
export async function analyzeFoodImage(
  imageBase64: string,
  mimeType: string,
  textDescription?: string,
): Promise<AIFoodAnalysisResponse> {
  if (!genAI) throw new Error('Gemini API not initialized');

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `Analyze this food image and estimate nutritional information.
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

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        mimeType,
        data: imageBase64,
      },
    },
  ]);

  const response = result.response.text();
  const cleanedResponse = response
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  return JSON.parse(cleanedResponse) as AIFoodAnalysisResponse;
}

// Valid muscle group categories for filtering
const MUSCLE_GROUP_CATEGORIES = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Legs',
  'Core',
  'Glutes',
  'Full Body',
] as const;

// Generate exercise details
export async function generateExerciseDetails(
  exerciseName: string,
): Promise<AIExerciseResponse> {
  if (!genAI) throw new Error('Gemini API not initialized');

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `You are a certified personal trainer and exercise science expert. Generate comprehensive exercise details for: "${exerciseName}"

Provide detailed, actionable information that helps someone perform this exercise safely and effectively.

IMPORTANT: For muscle_groups, you MUST ONLY use values from this list: ${MUSCLE_GROUP_CATEGORIES.join(', ')}
- Map anatomical terms to these categories (e.g., "Pectoralis Major" -> "Chest", "Latissimus Dorsi" -> "Back", "Quadriceps/Hamstrings" -> "Legs", "Deltoids" -> "Shoulders", "Abdominals/Obliques" -> "Core", "Gluteus Maximus" -> "Glutes")
- List primary muscle group first
- For compound movements targeting many areas, you can include "Full Body"

IMPORTANT: For exercise_type, determine which type this exercise is:
- "reps_weight": Exercise performed with reps and external weight (e.g., Bench Press, Squat, Bicep Curl)
- "reps_only": Exercise performed with reps but no weight (e.g., Pull-ups, Push-ups, Air Squats)
- "duration": Exercise held for time without weight (e.g., Plank, Dead Hang, Wall Sit)
- "duration_weight": Exercise held for time with weight (e.g., Weighted Plank, Farmer's Carry)

Return JSON format only, no markdown code blocks:
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

Guidelines:
- Description should be 3-5 sentences covering the full movement pattern
- Include 4-6 practical tips covering form, breathing, safety, and common errors
- Be specific and actionable - avoid vague instructions`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();
  const cleanedResponse = response
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  return JSON.parse(cleanedResponse) as AIExerciseResponse;
}

// Generate details for multiple exercises at once
export async function generateExerciseDetailsBatch(
  exerciseNames: string[],
): Promise<AIExerciseResponse[]> {
  if (!genAI) throw new Error('Gemini API not initialized');

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `You are a certified personal trainer and exercise science expert. Generate comprehensive exercise details for the following exercises:

${exerciseNames.map((name, i) => `${i + 1}. ${name}`).join('\n')}

For each exercise, provide detailed, actionable information that helps someone perform it safely and effectively.

IMPORTANT: For exercise_type, determine which type each exercise is:
- "reps_weight": Exercise performed with reps and external weight (e.g., Bench Press, Squat, Bicep Curl)
- "reps_only": Exercise performed with reps but no weight (e.g., Pull-ups, Push-ups, Air Squats)
- "duration": Exercise held for time without weight (e.g., Plank, Dead Hang, Wall Sit)
- "duration_weight": Exercise held for time with weight (e.g., Weighted Plank, Farmer's Carry)

Return a JSON array only, no markdown code blocks:
[
  {
    "name": "standardized exercise name",
    "description": "A comprehensive step-by-step guide on how to perform this exercise. Include: starting position, movement execution (concentric and eccentric phases), and end position. Be specific about body positioning, grip, stance, and range of motion.",
    "muscle_groups": ["primary muscle group", "secondary muscle groups..."],
    "equipment": "required equipment (or 'Bodyweight' if none)",
    "exercise_type": "reps_weight|reps_only|duration|duration_weight",
    "tips": [
      "Form cue or technique tip",
      "Common mistake to avoid", 
      "Breathing instruction",
      "Safety consideration"
    ]
  }
]

Guidelines:
- Return an array with one object per exercise, in the same order as the input list
- Description should be 3-5 sentences covering the full movement pattern
- Include 4-6 practical tips covering form, breathing, safety, and common errors
- Muscle groups should list primary muscle first, then secondary/stabilizers
- Be specific and actionable - avoid vague instructions`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();
  const cleanedResponse = response
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  return JSON.parse(cleanedResponse) as AIExerciseResponse[];
}

// Check for potential duplicate exercises using AI
export async function findDuplicateExercises(
  candidateName: string,
  existingExercises: Exercise[],
): Promise<Exercise[]> {
  if (!genAI) throw new Error('Gemini API not initialized');

  if (existingExercises.length === 0) return [];

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

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

  const result = await model.generateContent(prompt);
  const response = result.response.text();
  const cleanedResponse = response
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  try {
    const parsed = JSON.parse(cleanedResponse) as {
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
    console.error(
      'Failed to parse duplicate exercise response',
      error,
      cleanedResponse,
    );
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
  target_rate_kg_per_week: number;
}): Promise<AITargetResponse> {
  if (!genAI) throw new Error('Gemini API not initialized');

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `Calculate daily calorie and macro targets for:

Profile:
- Age: ${profile.age}
- Gender: ${profile.gender}
- Height: ${profile.height_cm}cm
- Weight: ${profile.weight_kg}kg
- Activity Level: ${profile.activity_level}
- Goal: ${profile.goal}
- Target Rate: ${profile.target_rate_kg_per_week}kg/week

Provide personalized daily targets considering the goal and sustainable progress.

Return JSON format only, no markdown code blocks:
{
  "calorie_target": daily_calories,
  "protein_g": protein_grams,
  "carbs_g": carb_grams,
  "fat_g": fat_grams,
  "reasoning": "brief explanation of calculation"
}`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();
  const cleanedResponse = response
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  return JSON.parse(cleanedResponse) as AITargetResponse;
}

// Review goals and progress
export async function reviewGoals(
  profile: UserProfile,
  weightHistory: WeightLog[],
  avgCalories: number,
  daysLogged: number,
  adherencePct: number,
): Promise<AIGoalReviewResponse> {
  if (!genAI) throw new Error('Gemini API not initialized');

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

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
- Age: ${profile.age}, Gender: ${profile.gender}, Height: ${profile.height_cm}cm
- Goal: ${profile.goal}
- Target rate: ${profile.target_rate_kg_per_week}kg/week
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

  const result = await model.generateContent(prompt);
  const response = result.response.text();
  const cleanedResponse = response
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  return JSON.parse(cleanedResponse) as AIGoalReviewResponse;
}

// Weekly progress review for Monday check-in
export async function reviewWeeklyProgress(
  profile: UserProfile,
  weeklyData: WeeklyReviewData,
): Promise<AIWeeklyReviewResponse> {
  if (!genAI) throw new Error('Gemini API not initialized');

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const weightDataSummary = weeklyData.weightLogs
    .map(
      (w) =>
        `${w.date}: ${w.weight_kg}kg${w.body_fat_pct ? ` (${w.body_fat_pct}% BF)` : ''}`,
    )
    .join('\n');

  const prompt = `You are a fitness coach conducting a weekly check-in review. Analyze the user's past week of progress and provide actionable recommendations.

User Profile:
- Age: ${profile.age}, Gender: ${profile.gender}, Height: ${profile.height_cm}cm
- Current Goal: ${profile.goal} (target rate: ${profile.target_rate_kg_per_week}kg/week)
- Current Calorie Target: ${profile.calorie_target} kcal/day
- Macro Targets: ${profile.protein_target_g}g protein, ${profile.carbs_target_g}g carbs, ${profile.fat_target_g}g fat

Week Summary (${weeklyData.weekStart} to ${weeklyData.weekEnd}):
- Days with weight logged: ${weeklyData.daysWithWeightLog}
- Days with calories logged: ${weeklyData.daysWithCalorieLog}
- Workouts completed: ${weeklyData.totalWorkouts}

Weight Data:
${weightDataSummary || 'No weight logs this week'}
${weeklyData.weightChange !== null ? `Weekly weight change: ${weeklyData.weightChange > 0 ? '+' : ''}${weeklyData.weightChange}kg` : ''}

Calorie Adherence:
- Average daily intake: ${weeklyData.avgDailyCalories} kcal
- Target: ${profile.calorie_target} kcal
- Adherence: ${weeklyData.calorieAdherence}%

Based on this data, provide a comprehensive weekly review. Consider:
1. Is the user on track for their ${profile.goal} goal?
2. Should they update body measurements (weight, body fat)? Recommend this if no recent measurements or if significant weight change detected.
3. Should calorie targets be adjusted? Consider if actual intake differs significantly from target or if weight isn't trending as expected.
4. Should the goal be changed? (e.g., cut -> lean bulk if target weight reached, or bulk -> cut if gaining too fast)
5. Are there any workout/program adjustments needed?

Return JSON format only, no markdown code blocks:
{
  "summary": "2-3 sentence overview of the week's progress",
  "onTrack": true/false,
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
    "caloriesReason": "explanation for calorie adjustment, or null",
    "changeGoal": true/false,
    "suggestedGoal": "bulk|lean_bulk|recomp|cut|maintain" or null,
    "goalReason": "why goal should change, or null",
    "changeProgram": true/false,
    "programSuggestion": "program advice or null"
  },
  "motivationalMessage": "encouraging message tailored to their progress"
}

Guidelines:
- Be encouraging but honest
- Only suggest goal changes if there's a clear reason (e.g., goal achieved, progress stalled for weeks)
- Calorie adjustments should be moderate (100-200 kcal) unless severely off track
- If data is limited, acknowledge uncertainty but still provide useful guidance`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();
  const cleanedResponse = response
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  return JSON.parse(cleanedResponse) as AIWeeklyReviewResponse;
}

// Generate a complete workout program based on user preferences
export async function generateWorkoutProgram(
  input: AIProgramGeneratorInput,
  existingExercises: Exercise[],
): Promise<AIProgramGeneratorResponse> {
  if (!genAI) throw new Error('Gemini API not initialized');

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

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

  const prompt = `You are an expert strength and conditioning coach. Create a complete workout program based on these specifications:

USER PREFERENCES:
- Training frequency: ${input.trainingDaysPerWeek} days per week
- Session duration: ${input.sessionDurationMinutes} minutes per session
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

PROGRAM DESIGN GUIDELINES:
1. For ${input.experienceLevel} level:
   ${input.experienceLevel === 'beginner' ? '- Focus on compound movements, 2-3 sets per exercise, full body or simple splits' : ''}
   ${input.experienceLevel === 'intermediate' ? '- Mix of compound and isolation, 3-4 sets per exercise, can use more complex splits' : ''}
   ${input.experienceLevel === 'advanced' ? '- Can include advanced techniques, 3-5 sets, specialized programming' : ''}

2. Rep ranges by goal:
   - Bulk/Lean Bulk: 6-12 reps for hypertrophy
   - Cut: 8-15 reps, higher volume
   - Recomp: Mix of 5-8 (strength) and 10-15 (metabolic)
   - Maintain: 6-10 reps

3. Session structure:
   - Start with compound movements
   - Progress to isolation exercises
   - Include appropriate warm-up movements
   - Consider supersets for time efficiency if session is short

4. Weekly volume guidelines:
   - Major muscle groups: 10-20 sets per week
   - Smaller muscles (biceps, triceps): 8-14 sets per week
   - Prioritize ${input.focusAreas?.length ? input.focusAreas.join(' and ') : 'balanced development'}

5. Day of week assignment:
   - Assign each session a specific day (0=Sunday through 6=Saturday)
   - Allow adequate rest between sessions hitting the same muscles
   - For ${input.trainingDaysPerWeek} days: suggest optimal spacing

Return JSON format only, no markdown code blocks:
{
  "programName": "descriptive program name",
  "programDescription": "2-3 sentence program overview",
  "sessions": [
    {
      "name": "Session name (e.g., 'Push Day', 'Upper Body A')",
      "dayOfWeek": 1,
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
  ]
}

CRITICAL RULES:
- ONLY use exercises that can be done with the available equipment
- Exercise names should be standard, recognizable names
- For duration-based exercises (planks, holds), set targetDurationSeconds instead of reps
- Ensure balanced muscle development unless specific focus areas requested
- ${input.sessionDurationMinutes} minute sessions should have roughly ${Math.floor(input.sessionDurationMinutes / 7)}-${Math.floor(input.sessionDurationMinutes / 5)} exercises`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();
  const cleanedResponse = response
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  return JSON.parse(cleanedResponse) as AIProgramGeneratorResponse;
}
