import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  AIFoodAnalysisResponse,
  AIExerciseResponse,
  AITargetResponse,
  AIGoalReviewResponse,
  UserProfile,
  WeightLog,
} from '../types';

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
