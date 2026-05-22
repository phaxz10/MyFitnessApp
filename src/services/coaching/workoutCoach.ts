import type { Tool } from 'openai/resources/responses/responses';
import { z } from 'zod';
import type {
  AIExerciseCoachingResponse,
  ExerciseNote,
  WorkoutSet,
} from '../../types';
import { complete } from '../ai/aiClient';

const WEB_SEARCH_TOOL: Tool = { type: 'web_search' };

const progressionDirectionEnum = z.enum(['increase', 'maintain', 'decrease']);

const setProgressionSchema = z.object({
  setNumber: z.number(),
  weight: progressionDirectionEnum,
  reps: progressionDirectionEnum,
  suggestedWeight: z.number(),
  suggestedReps: z.number(),
});

const exerciseCoachingSchema = z.object({
  exerciseId: z.number(),
  overallTrend: z.enum(['progressing', 'plateau', 'regressing']),
  sets: z.array(setProgressionSchema),
  coachingTip: z.string(),
}) satisfies z.ZodType<AIExerciseCoachingResponse>;

/**
 * Get AI coaching recommendations for exercise progression.
 * High-stakes — the response drives the UI showing recommended weights/reps
 * for the next set, so we validate the shape.
 */
export async function getExerciseCoaching(
  exerciseName: string,
  exerciseHistory: { date: string; sets: WorkoutSet[] }[],
  targetRepMin: number,
  targetRepMax: number,
  targetSets: number,
  exerciseNotes: ExerciseNote[] = [],
): Promise<AIExerciseCoachingResponse> {
  const historyFormatted = exerciseHistory
    .slice(-5)
    .map((session) => {
      const setsStr = session.sets
        .map((s, i) => `Set ${i + 1}: ${s.weight_kg ?? 0}lbs × ${s.reps ?? 0}`)
        .join(', ');
      return `${session.date}: ${setsStr}`;
    })
    .join('\n');

  const lastSession = exerciseHistory[exerciseHistory.length - 1];
  const lastSets = lastSession?.sets || [];
  const notesSummary = exerciseNotes.length
    ? exerciseNotes
        .slice(-5)
        .map((note) => `- ${note.content}`)
        .join('\n')
    : 'No exercise notes available';

  const prompt = `You are an expert strength coach analyzing exercise progression data. Based on the training history, provide recommendations for the next workout.

EXERCISE: ${exerciseName}
TARGET: ${targetSets} sets × ${targetRepMin}-${targetRepMax} reps

EXERCISE NOTES (most recent last):
${notesSummary}

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
- Consider user notes when analyzing performance
- Return exactly ${targetSets} sets in the response
- suggestedWeight should be a realistic number based on history (use last weight as baseline)
- suggestedReps should be within the target range (${targetRepMin}-${targetRepMax})
- If no history, suggest conservative starting weights and recommend "maintain" for first session
- Weight increments should be practical: 5lb for upper body, 5-10lb for lower body
- Use builtwithscience.com publicly available data as reference where applicable`;

  return complete({
    prompt,
    schema: exerciseCoachingSchema,
    tools: [WEB_SEARCH_TOOL],
  });
}
