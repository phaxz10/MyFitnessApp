import { z } from 'zod';
import type {
  AIExerciseCoachingResponse,
  ExerciseNote,
  WorkoutSet,
} from '../../types';
import { complete } from '../ai/aiClient';

// Coaching responses are cached for 7 days because progression recommendations
// only change meaningfully between workout sessions, not between page loads.
// Cache key includes the exercise history, so new sessions invalidate it.
const COACHING_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

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

  // temperature: 0.2 keeps progression recommendations consistent and conservative.
  // The double-rep-range model (double progression): increase reps first within the
  // target range, then increase weight when top of range is hit on all sets.
  const prompt = `You are an evidence-based strength coach specializing in progressive overload programming. Analyze the training data below and recommend weights/reps for the next workout session.

EXERCISE: ${exerciseName}
TARGET: ${targetSets} sets × ${targetRepMin}-${targetRepMax} reps

ATHLETE NOTES (most recent last):
${notesSummary}

RECENT TRAINING HISTORY (most recent last, up to 5 sessions):
${historyFormatted || 'No previous history — this is their first session'}

LAST SESSION DETAIL:
${lastSets.map((s, i) => `Set ${i + 1}: ${s.weight_kg ?? 0}lbs × ${s.reps ?? 0} reps`).join('\n') || 'No data'}

DOUBLE PROGRESSION MODEL:
1. All sets hit ${targetRepMax} reps (top of range) → INCREASE weight by 5lbs (upper body) or 10lbs (lower body)
2. All sets hit ${Math.floor((targetRepMin + targetRepMax) / 2)}+ reps (mid-range) → MAINTAIN weight, aim for +1 rep per set
3. Any set below ${targetRepMin} reps (below range) → DECREASE weight by 5lbs or maintain and prioritize form
4. Multiple sessions at same weight hitting top of range → definitely ready to progress (overdue)
5. Normal set-to-set fatigue: 1-2 rep drop per set is expected. A 4+ rep drop suggests the weight is too heavy.

TREND DETECTION:
- Progressing: weight or reps increasing over the last 3+ sessions
- Plateau: same weight and reps for 3+ sessions
- Regressing: weight or reps decreasing, or failure to hit minimum reps

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
  "coachingTip": "One sentence of actionable advice (e.g. 'Focus on controlled eccentric' or 'Ready to move up to 135lbs')"
}

HARD RULES:
- Return EXACTLY ${targetSets} sets
- suggestedWeight must be based on last session's weight (not invented)
- suggestedReps must be within ${targetRepMin}-${targetRepMax}
- If no history exists, suggest a conservative starting weight and "maintain" for all directions
- Weight increments: 5lb for upper body isolation, 5-10lb for compound movements
- Account for athlete notes (e.g. "felt easy" → more aggressive progression, "shoulder pain" → deload)
- coachingTip should be specific to this exercise, not generic advice`;

  return complete({
    prompt,
    schema: exerciseCoachingSchema,
    schemaName: 'exercise_coaching',
    temperature: 0.2,
    cache: {
      namespace: 'exercise_coaching',
      ttlMs: COACHING_CACHE_TTL_MS,
    },
  });
}
