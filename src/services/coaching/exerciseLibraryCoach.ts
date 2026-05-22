import type { Tool } from 'openai/resources/responses/responses';
import { z } from 'zod';
import { MUSCLE_GROUPS } from '../../constants/equipment';
import type { AIExerciseResponse, Exercise } from '../../types';
import { complete, respond } from '../ai/aiClient';

const WEB_SEARCH_TOOL: Tool = { type: 'web_search' };

const exerciseTypeEnum = z.enum([
  'reps_weight',
  'reps_only',
  'duration',
  'duration_weight',
]);

const exerciseDetailsSchema = z.object({
  name: z.string(),
  description: z.string(),
  muscle_groups: z.array(z.string()),
  equipment: z.string(),
  exercise_type: exerciseTypeEnum,
  tips: z.array(z.string()),
}) satisfies z.ZodType<AIExerciseResponse>;

const exerciseDetailsArraySchema = z.array(exerciseDetailsSchema);

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

IMPORTANT: For muscle_groups, you MUST ONLY use values from this list: ${MUSCLE_GROUPS.join(', ')}
- Map anatomical terms to these categories, using simple region cues to pick the best category (upper/mid/lower chest or back, front/side/rear shoulders, quads/hamstrings/calves for legs, upper/lower abs or obliques for core, upper/lower glutes). Example mappings: "Pectoralis Major" -> "Chest", "Latissimus Dorsi" -> "Back", "Quadriceps" -> "Quads", "Hamstrings" -> "Hamstrings", "Deltoids" -> "Shoulders", "Abdominals" -> "Core", "Obliques" -> "Core", "Gluteus Maximus/Med" -> "Glutes", "Calves" -> "Calves"
- If multiple muscle groups are targeted, include both primary and secondary groups and specific region of the primary group. For example: a bench press targets "Chest" primarily and "Triceps" secondarily so the list would be ["Chest", "Mid Chest", "Triceps"]. another exampe: a deadlift targets "Back" primarily and "Hamstrings" secondarily so the list would be ["Back", "Lower Back", "Hamstrings"]
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

export async function generateExerciseDetails(
  exerciseName: string,
): Promise<AIExerciseResponse> {
  const prompt = buildExerciseDetailsPrompt([exerciseName]);

  // The prompt's response shape is always an array; pull the first item.
  const items = await complete({
    prompt,
    schema: exerciseDetailsArraySchema,
    tools: [WEB_SEARCH_TOOL],
  });

  const first = items[0];
  if (!first) {
    throw new Error('AI returned no exercise details');
  }
  return first;
}

export async function generateExerciseDetailsBatch(
  exerciseNames: string[],
): Promise<AIExerciseResponse[]> {
  const prompt = buildExerciseDetailsPrompt(exerciseNames);

  return complete({
    prompt,
    schema: exerciseDetailsArraySchema,
    tools: [WEB_SEARCH_TOOL],
  });
}

// Low-stakes "fuzzy match" — soft-fail rather than throw on bad JSON,
// since the worst case is the dedupe prompt isn't shown to the user.
export async function findDuplicateExercises(
  candidateName: string,
  existingExercises: Exercise[],
): Promise<Exercise[]> {
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

  const response = await respond({ prompt });
  const text = response.output_text ?? '';

  try {
    const cleaned = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const parsed = JSON.parse(cleaned) as {
      duplicate_indices?: number[];
    };
    const indices = Array.isArray(parsed.duplicate_indices)
      ? parsed.duplicate_indices.filter((n) => Number.isInteger(n) && n >= 1)
      : [];

    if (indices.length === 0) return [];

    return indices
      .map((i) => existingExercises[i - 1])
      .filter((ex): ex is Exercise => ex !== undefined);
  } catch (error) {
    console.error('Failed to parse duplicate exercise response', error, text);
    return [];
  }
}
