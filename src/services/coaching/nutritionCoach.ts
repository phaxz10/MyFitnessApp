import type { Tool } from 'openai/resources/responses/responses';
import { z } from 'zod';
import type { AIFoodAnalysisResponse, AITargetResponse } from '../../types';
import { complete } from '../ai/aiClient';

const WEB_SEARCH_TOOL: Tool = { type: 'web_search' };

const foodItemSchema = z.object({
  name: z.string(),
  portion_grams: z.number(),
  calories: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
});

const foodAnalysisSchema = z.object({
  items: z.array(foodItemSchema),
  total: z.object({
    calories: z.number(),
    protein_g: z.number(),
    carbs_g: z.number(),
    fat_g: z.number(),
  }),
}) satisfies z.ZodType<AIFoodAnalysisResponse>;

export async function analyzeFoodText(
  foodDescription: string,
): Promise<AIFoodAnalysisResponse> {
  const prompt = `Analyze the following food description and look up on the internet for nutritional information.
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
    tools: [WEB_SEARCH_TOOL],
    temperature: 1,
  });
}

export async function analyzeFoodImage(
  imageBase64: string,
  mimeType: string,
  textDescription?: string,
): Promise<AIFoodAnalysisResponse> {
  const prompt = `Analyze this food image and estimate nutritional information. please throw error if the image is not food.
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
    temperature: 1,
  });
}

const targetSchema = z.object({
  calorie_target: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  reasoning: z.string(),
}) satisfies z.ZodType<AITargetResponse>;

export async function calculateTargets(profile: {
  age: number;
  gender: 'male' | 'female';
  height_cm: number;
  weight_kg: number;
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active';
  goal: 'bulk' | 'lean_bulk' | 'recomp' | 'cut' | 'maintain';
}): Promise<AITargetResponse> {
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

  return complete({
    prompt,
    schema: targetSchema,
    tools: [WEB_SEARCH_TOOL],
  });
}
