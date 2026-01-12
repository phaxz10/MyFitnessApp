import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  AIFoodAnalysisResponse,
  AIExerciseResponse,
  AITargetResponse,
  AIGoalReviewResponse,
  AIWeeklyReviewResponse,
  AIProgramGeneratorInput,
  AIProgramGeneratorResponse,
  AIExerciseCoachingResponse,
  UserProfile,
  WeightLog,
  Exercise,
  WeeklyReviewData,
  WorkoutSet,
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

  const model = genAI.getGenerativeModel({
    model: 'gemini-3-flash-preview',
    tools: [
      {
        googleSearchRetrieval: {},
      },
    ],
  });

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

  const model = genAI.getGenerativeModel({
    model: 'gemini-3-flash-preview',
    tools: [
      {
        googleSearchRetrieval: {},
      },
    ],
  });

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

  const model = genAI.getGenerativeModel({
    model: 'gemini-3-flash-preview',
    tools: [
      {
        googleSearchRetrieval: {},
      },
    ],
  });

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

  const model = genAI.getGenerativeModel({
    model: 'gemini-3-flash-preview',
    tools: [
      {
        googleSearchRetrieval: {},
      },
    ],
  });

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

  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

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

  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

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

  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

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

  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

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
- If data is limited, acknowledge uncertainty but note that consistent logging helps identify metabolic patterns`;

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

  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

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

  const prompt = `You are an expert strength and conditioning coach using evidence-based programming principles. Create a complete workout program based on these specifications:

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
   ${input.experienceLevel === 'beginner' ? '- Beginners: 10-12 sets per major muscle group' : ''}
   ${input.experienceLevel === 'intermediate' ? '- Intermediate: 12-16 sets per major muscle group' : ''}
   ${input.experienceLevel === 'advanced' ? '- Advanced: 16-20 sets per major muscle group' : ''}
   - Arms (biceps, triceps): 6-10 direct sets (they get indirect work from compounds)
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
   - Use supersets for antagonist muscles to save time (e.g., biceps/triceps, chest/back)
   - Save abs/core for end of session

5. REP RANGES BY GOAL (evidence-based):
   ${
     input.goal === 'bulk' || input.goal === 'lean_bulk'
       ? `For ${input.goal}:
   - Primary: 6-12 reps (optimal hypertrophy range)
   - Compounds: 6-8 reps (heavier for strength base)
   - Isolation: 10-15 reps (metabolic stress, safer)
   - Focus on progressive overload`
       : ''
   }
   ${
     input.goal === 'cut'
       ? `For cutting:
   - Maintain strength: Keep some heavy work (4-6 reps) on main lifts
   - Volume work: 8-15 reps for muscle retention
   - Avoid excessive volume (recovery is compromised in deficit)
   - Prioritize compound movements to preserve muscle`
       : ''
   }
   ${
     input.goal === 'recomp'
       ? `For recomposition:
   - Strength days: 4-6 reps on compounds
   - Hypertrophy days: 8-12 reps
   - Mix both approaches across the week
   - Focus on progressive overload despite maintenance calories`
       : ''
   }
   ${
     input.goal === 'maintain'
       ? `For maintenance:
   - Moderate rep range: 6-10 reps
   - Maintain current intensity (weight on bar)
   - Can reduce volume by ~30% from building phase
   - Focus on movement quality`
       : ''
   }

6. RECOVERY & DAY SPACING:
   - Allow 48-72 hours between training the same muscle group
   - Don't schedule heavy leg day before/after heavy deadlift work
   - Consider: Mon/Tue training leaves Wed for recovery
   - Avoid training chest/triceps day before shoulder day
   ${input.trainingDaysPerWeek <= 3 ? `- With ${input.trainingDaysPerWeek} days: Mon/Wed/Fri or similar alternating pattern` : ''}
   ${input.trainingDaysPerWeek === 4 ? '- With 4 days: Mon/Tue/Thu/Fri or Mon/Wed/Fri/Sat' : ''}
   ${input.trainingDaysPerWeek >= 5 ? `- With ${input.trainingDaysPerWeek} days: Push/Pull/Legs/Push/Pull or similar rotation` : ''}

7. SPECIFIC EXERCISE RECOMMENDATIONS BY MUSCLE:
   - CHEST: Incline press (upper), flat press (mid), flyes (stretch), dips (lower)
   - BACK: Pull-ups/pulldowns (width), rows (thickness), face pulls (rear delts)
   - SHOULDERS: Overhead press (front), lateral raises (side), reverse flyes (rear)
   - QUADS: Squats, lunges, leg press, leg extensions
   - HAMSTRINGS: Romanian deadlifts (hip hinge), leg curls (knee flexion)
   - GLUTES: Hip thrusts, Bulgarian split squats, Romanian deadlifts
   - BICEPS: Different curl variations (barbell, dumbbell, hammer for brachialis)
   - TRICEPS: Close-grip press (medial/lateral), overhead extension (long head)

8. Day of week assignment:
   - Assign each session a specific day (0=Sunday through 6=Saturday)
   - For ${input.trainingDaysPerWeek} days: optimal spacing with rest days between
   - Don't cluster all training days together

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
- ${input.sessionDurationMinutes} minute sessions should have roughly ${Math.floor(input.sessionDurationMinutes / 7)}-${Math.floor(input.sessionDurationMinutes / 5)} exercises
- If possible, research for builtwithscience.com publicly available routines to align with evidence-based practices`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();
  const cleanedResponse = response
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  return JSON.parse(cleanedResponse) as AIProgramGeneratorResponse;
}

// Get AI coaching recommendations for exercise progression
export async function getExerciseCoaching(
  exerciseName: string,
  exerciseHistory: { date: string; sets: WorkoutSet[] }[],
  targetRepMin: number,
  targetRepMax: number,
  targetSets: number,
): Promise<AIExerciseCoachingResponse> {
  if (!genAI) throw new Error('Gemini API not initialized');

  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

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
- Weight increments should be practical: 5lb for upper body, 5-10lb for lower body`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();
  const cleanedResponse = response
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  return JSON.parse(cleanedResponse) as AIExerciseCoachingResponse;
}
