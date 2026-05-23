import type { Tool } from 'openai/resources/responses/responses';
import { z } from 'zod';
import type { AIFoodAnalysisResponse, AITargetResponse } from '../../types';
import { complete } from '../ai/aiClient';

// web_search enables the AI to look up branded foods, restaurant menus, and
// regional dishes for accurate nutritional data instead of guessing.
const WEB_SEARCH_TOOL: Tool = { type: 'web_search' };

const foodItemSchema = z.object({
  name: z.string().min(1),
  portion_grams: z.number().nonnegative(),
  calories: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
});

const foodAnalysisSchema = z.object({
  items: z.array(foodItemSchema).min(1),
  total: z.object({
    calories: z.number().nonnegative(),
    protein_g: z.number().nonnegative(),
    carbs_g: z.number().nonnegative(),
    fat_g: z.number().nonnegative(),
  }),
}) satisfies z.ZodType<AIFoodAnalysisResponse>;

const targetReasoningSchema = z.object({
  reasoning: z.string(),
});

type TargetProfile = {
  age: number;
  gender: 'male' | 'female';
  height_cm: number;
  weight_kg: number;
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active';
  goal: 'bulk' | 'lean_bulk' | 'recomp' | 'cut' | 'maintain';
};

export async function analyzeFoodText(
  foodDescription: string,
): Promise<AIFoodAnalysisResponse> {
  const prompt = `Analyze the following food description and estimate nutritional information.
Use web search for branded/restaurant/package items when useful. Prefer official nutrition facts, USDA-style references, or common serving databases. If exact data is unavailable, use a conservative generic estimate.

Return valid JSON only. All numeric values must be pre-computed numbers (e.g. 279, not "1.5 * 186"). No arithmetic expressions. No markdown code blocks.

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

  return complete({
    prompt,
    schema: foodAnalysisSchema,
    schemaName: 'food_analysis',
    tools: [WEB_SEARCH_TOOL],
    tool_choice: 'auto',
    temperature: 0.2,
  }).then(normalizeFoodAnalysis);
}

export async function analyzeFoodImage(
  imageBase64: string,
  mimeType: string,
  textDescription?: string,
): Promise<AIFoodAnalysisResponse> {
  const prompt = `Analyze this food image and estimate nutritional information. If the image is not food, return no food item by refusing rather than inventing food.
${textDescription ? `Additional context from user: ${textDescription}` : ''}

Estimate visible portions in grams. Prefer conservative estimates and split distinct foods into separate items. All numeric values must be pre-computed numbers; no arithmetic expressions.

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

  return complete({
    prompt: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          {
            type: 'input_image',
            image_url: `data:${mimeType};base64,${imageBase64}`,
            detail: 'auto',
          },
        ],
      },
    ],
    schema: foodAnalysisSchema,
    schemaName: 'food_analysis',
    temperature: 0.2,
  }).then(normalizeFoodAnalysis);
}

export async function calculateTargets(
  profile: TargetProfile,
): Promise<AITargetResponse> {
  const targets = calculateDeterministicTargets(profile);
  const prompt = `Write a concise explanation for these already-computed calorie and macro targets. Do not change the numbers.

Profile:
- Age: ${profile.age}
- Gender: ${profile.gender}
- Height: ${profile.height_cm}cm
- Weight: ${profile.weight_kg}kg
- Activity Level: ${profile.activity_level}
- Goal: ${profile.goal}

Computed formula:
- Mifflin-St Jeor BMR
- Activity multiplier based on activity level
- Goal adjustment based on sustainable rate of change
- Protein and fat set from body weight; carbs fill remaining calories

Computed targets:
- Calories: ${targets.calorie_target} kcal/day
- Protein: ${targets.protein_g}g/day
- Carbs: ${targets.carbs_g}g/day
- Fat: ${targets.fat_g}g/day

Return JSON format only, no markdown code blocks:
{
  "reasoning": "brief explanation of the calculation"
}`;

  try {
    const result = await complete({
      prompt,
      schema: targetReasoningSchema,
      schemaName: 'target_reasoning',
      temperature: 0.2,
    });
    return { ...targets, reasoning: result.reasoning };
  } catch {
    return targets;
  }
}

// Deterministic target calculation using Mifflin-St Jeor BMR equation.
// The AI is only used to generate a human-readable explanation of the numbers —
// the numbers themselves are computed here to ensure consistency and testability.
// Macro split: protein from bodyweight multiplier (1.8-2.1g/kg based on goal),
// fat floor of 25% calories or 0.6g/kg, remainder to carbs.
export function calculateDeterministicTargets(
  profile: TargetProfile,
): AITargetResponse {
  const weight = profile.weight_kg;
  const bmr =
    profile.gender === 'male'
      ? 10 * weight + 6.25 * profile.height_cm - 5 * profile.age + 5
      : 10 * weight + 6.25 * profile.height_cm - 5 * profile.age - 161;
  const tdee = bmr * activityMultiplier(profile.activity_level);
  const calories = roundToNearest(
    tdee + goalCalorieAdjustment(tdee, profile.goal),
    25,
  );
  const protein = Math.round(weight * proteinMultiplier(profile.goal));
  const fat = Math.round(Math.max(weight * 0.6, (calories * 0.25) / 9));
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

  return {
    calorie_target: calories,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    reasoning: `Based on Mifflin-St Jeor estimated maintenance of ${Math.round(
      tdee,
    )} kcal/day, adjusted for ${profile.goal.replace('_', ' ')} with macros set from body weight.`,
  };
}

// Recomputes totals from individual items to fix a common LLM error:
// the model sometimes returns items that don't sum to the stated total.
// Also rounds all values to 1 decimal place for clean UI display.
function normalizeFoodAnalysis(
  response: AIFoodAnalysisResponse,
): AIFoodAnalysisResponse {
  const items = response.items.map((item) => ({
    name: item.name.trim(),
    portion_grams: roundMacro(item.portion_grams),
    calories: roundMacro(item.calories),
    protein_g: roundMacro(item.protein_g),
    carbs_g: roundMacro(item.carbs_g),
    fat_g: roundMacro(item.fat_g),
  }));

  return {
    items,
    total: {
      calories: roundMacro(sum(items, 'calories')),
      protein_g: roundMacro(sum(items, 'protein_g')),
      carbs_g: roundMacro(sum(items, 'carbs_g')),
      fat_g: roundMacro(sum(items, 'fat_g')),
    },
  };
}

function activityMultiplier(level: TargetProfile['activity_level']): number {
  const multipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
  };
  return multipliers[level];
}

function goalCalorieAdjustment(
  tdee: number,
  goal: TargetProfile['goal'],
): number {
  switch (goal) {
    case 'bulk':
      return Math.min(500, Math.max(300, tdee * 0.15));
    case 'lean_bulk':
      return Math.min(300, Math.max(150, tdee * 0.08));
    case 'cut':
      return -Math.min(750, Math.max(300, tdee * 0.2));
    case 'recomp':
    case 'maintain':
      return 0;
  }
}

function proteinMultiplier(goal: TargetProfile['goal']): number {
  switch (goal) {
    case 'cut':
    case 'recomp':
      return 2.1;
    case 'bulk':
    case 'lean_bulk':
      return 1.8;
    case 'maintain':
      return 1.9;
  }
}

function roundToNearest(value: number, nearest: number): number {
  return Math.round(value / nearest) * nearest;
}

function roundMacro(value: number): number {
  return Math.round(value * 10) / 10;
}

function sum(
  items: AIFoodAnalysisResponse['items'],
  key: keyof AIFoodAnalysisResponse['total'],
): number {
  return items.reduce((total, item) => total + item[key], 0);
}
