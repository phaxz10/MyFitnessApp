import { z } from 'zod';
import type {
  AIExerciseCoachingResponse,
  ExerciseNote,
  WorkoutSet,
} from '../../types';
import {
  fromInputWeight,
  toDisplayWeight,
  unitLabel,
  type WeightUnit,
} from '../../utils/units';
import { complete } from '../ai/aiClient';

// One batched call per workout session covers every rep-based exercise.
// Responses are cached for 7 days because progression recommendations only
// change meaningfully between workout sessions, not between page loads. The
// cache key is the prompt, which carries every exercise's history, targets
// and notes — a newly completed session invalidates it.
//
// Units: the prompt sends and asks for weights in the user's display unit
// (so the coaching tip reads naturally), and suggestedWeight is converted
// back to kg before returning, matching storage.
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

// Object root (not a bare array) so strict structured-output mode applies.
const sessionCoachingSchema = z.object({
  exercises: z.array(exerciseCoachingSchema),
});

export interface CoachingRequest {
  exerciseId: number;
  exerciseName: string;
  /** Chronological (oldest first). */
  history: { date: string; sets: WorkoutSet[] }[];
  targetRepMin: number;
  targetRepMax: number;
  targetSets: number;
  notes?: ExerciseNote[];
}

// Fixed coaching rules go in `system` so the prefix is identical on every
// call (provider prompt caching); per-exercise data goes in the prompt.
function coachingInstructions(unit: WeightUnit): string {
  const u = unitLabel(unit);
  const [smallStep, bigStep] = unit === 'lbs' ? [5, 10] : [2.5, 5];
  return `You are an evidence-based strength coach specializing in progressive overload programming. For EACH exercise in the user's message, analyze its training data and recommend weights/reps for the next workout session. Reason about each exercise independently.

UNITS: every weight is in ${u}, and every weight you return must be in ${u}.

DOUBLE PROGRESSION MODEL (per exercise, using its own target range):
1. All sets hit the top of the rep range → INCREASE weight by ${smallStep} ${u} (upper body) or ${bigStep} ${u} (lower body)
2. All sets hit mid-range or better → MAINTAIN weight, aim for +1 rep per set
3. Any set below the bottom of the range → DECREASE weight by ${smallStep} ${u} or maintain and prioritize form
4. Multiple sessions at the same weight hitting the top of the range → definitely ready to progress (overdue)
5. Normal set-to-set fatigue: a 1-2 rep drop per set is expected. A 4+ rep drop suggests the weight is too heavy.

TREND DETECTION:
- progressing: weight or reps increasing over the last 3+ sessions
- plateau: same weight and reps for 3+ sessions
- regressing: weight or reps decreasing, or failure to hit minimum reps

HARD RULES:
- Return one entry per exercise, with "exerciseId" copied exactly from the input
- Each entry has EXACTLY that exercise's target number of sets
- suggestedWeight must be based on the last session's weight (not invented)
- suggestedReps must be within that exercise's target rep range
- Weight increments: ${smallStep} ${u} for upper body isolation, ${smallStep}-${bigStep} ${u} for compound movements
- Account for athlete notes (e.g. "felt easy" → more aggressive progression, "shoulder pain" → deload)
- coachingTip: one sentence of actionable advice specific to that exercise, not generic advice

Output: a JSON object matching the provided schema — {"exercises": [...]}.`;
}

function formatExercise(req: CoachingRequest, unit: WeightUnit): string {
  const u = unitLabel(unit);
  const w = (kg: number | null) => toDisplayWeight(kg ?? 0, unit, 'lift');
  const history = req.history
    .slice(-5)
    .map(
      (session) =>
        `  ${session.date}: ${session.sets
          .map((s) => `${w(s.weight_kg)}×${s.reps ?? 0}`)
          .join(', ')}`,
    )
    .join('\n');
  const notes = (req.notes ?? [])
    .slice(-5)
    .map((note) => `  - ${note.content}`)
    .join('\n');
  return `exerciseId ${req.exerciseId}: ${req.exerciseName}
TARGET: ${req.targetSets} sets × ${req.targetRepMin}-${req.targetRepMax} reps
HISTORY (${u} × reps, oldest first, last entry = last session):
${history || '  none — first session (suggest a conservative start, "maintain" everywhere)'}
NOTES:
${notes || '  none'}`;
}

/**
 * Get AI progression coaching for every exercise in a session in ONE call.
 * High-stakes — the response drives the UI showing recommended weights/reps
 * for the next set, so we validate the shape. Entries the model omits or
 * whose exerciseId doesn't match a request are dropped.
 */
export async function getSessionCoaching(
  requests: CoachingRequest[],
  unit: WeightUnit = 'kg',
): Promise<Map<number, AIExerciseCoachingResponse>> {
  const result = new Map<number, AIExerciseCoachingResponse>();
  if (requests.length === 0) return result;

  // Sorted so the same set of exercises always produces the same prompt
  // (and therefore the same cache key), whatever order the UI lists them in.
  const sorted = [...requests].sort((a, b) => a.exerciseId - b.exerciseId);
  const prompt = sorted.map((req) => formatExercise(req, unit)).join('\n\n');

  // temperature 0.2 keeps progression recommendations consistent and
  // conservative.
  const response = await complete({
    instructions: coachingInstructions(unit),
    prompt,
    schema: sessionCoachingSchema,
    schemaName: 'session_coaching',
    reasoning: 'medium',
    temperature: 0.2,
    cache: {
      namespace: 'session_coaching',
      ttlMs: COACHING_CACHE_TTL_MS,
    },
  });

  const requested = new Set(requests.map((r) => r.exerciseId));
  for (const coaching of response.exercises) {
    if (!requested.has(coaching.exerciseId)) continue;
    result.set(coaching.exerciseId, {
      ...coaching,
      sets: coaching.sets.map((set) => ({
        ...set,
        suggestedWeight: fromInputWeight(set.suggestedWeight, unit),
      })),
    });
  }
  return result;
}
