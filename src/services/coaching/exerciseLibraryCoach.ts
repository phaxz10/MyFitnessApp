import { z } from 'zod';
import { MUSCLE_GROUPS } from '../../constants/equipment';
import type { AIExerciseResponse, Exercise } from '../../types';
import {
  complete,
  normalizeCacheText,
  readAICache,
  writeAICache,
} from '../ai/aiClient';

// No web search here: form descriptions, muscle groups and exercise types are
// stable textbook knowledge the model already has, and ':online' is billed
// per request.

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

// Wrapped in an object (rather than a bare array) so it qualifies for
// OpenAI's strict structured-output mode — the SDK helper throws on
// array-root schemas, which would silently disable structured output and
// drop us back to prompt-guided JSON.
const exerciseDetailsBatchSchema = z.object({
  exercises: z.array(exerciseDetailsSchema),
});

// Exercise details are textbook knowledge — cache per exercise name for 90
// days. Bump the version when the instructions change materially.
const DETAILS_CACHE_NAMESPACE = 'exercise_details';
const DETAILS_CACHE_VERSION = 2;
const DETAILS_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 90;

// Fixed instructions (system) first; only the exercise list varies.
const EXERCISE_DETAILS_INSTRUCTIONS = `You are a certified personal trainer and exercise science expert. Generate comprehensive exercise details for each exercise the user lists. Provide detailed, actionable information that helps someone perform the exercise safely and effectively.

FIELDS:
- name: standardized exercise name
- description: a comprehensive step-by-step guide — starting position, movement execution (concentric and eccentric phases), and end position. Be specific about body positioning, grip, stance, and range of motion. 3-5 sentences.
- muscle_groups: primary first, then secondary
- equipment: required equipment (or "Bodyweight" if none)
- exercise_type: see below
- tips: 4-6 practical tips covering a form cue, a common mistake to avoid, a breathing instruction (e.g. "Exhale during the lift, inhale on the descent"), a safety consideration, and a progression or variation tip

IMPORTANT: For muscle_groups, you MUST ONLY use values from this list: ${MUSCLE_GROUPS.join(', ')}
- Map anatomical terms to these categories, using simple region cues to pick the best category (upper/mid/lower chest or back, front/side/rear shoulders, quads/hamstrings/calves for legs, upper/lower abs or obliques for core, upper/lower glutes). Example mappings: "Pectoralis Major" -> "Chest", "Latissimus Dorsi" -> "Back", "Quadriceps" -> "Quads", "Hamstrings" -> "Hamstrings", "Deltoids" -> "Shoulders", "Abdominals" -> "Core", "Obliques" -> "Core", "Gluteus Maximus/Med" -> "Glutes", "Calves" -> "Calves"
- If multiple muscle groups are targeted, include both primary and secondary groups and specific region of the primary group. For example: a bench press targets "Chest" primarily and "Triceps" secondarily so the list would be ["Chest", "Mid Chest", "Triceps"]. Another example: a deadlift targets "Back" primarily and "Hamstrings" secondarily so the list would be ["Back", "Lower Back", "Hamstrings"]
- For exercises targeting arms, also include triceps or biceps or both as applicable
- For compound movements targeting many areas, you can include "Full Body"

IMPORTANT: For exercise_type, determine which type the exercise is:
- "reps_weight": reps with external weight (e.g., Bench Press, Squat, Bicep Curl)
- "reps_only": reps with no weight (e.g., Pull-ups, Push-ups, Air Squats)
- "duration": held for time without weight (e.g., Plank, Dead Hang, Wall Sit)
- "duration_weight": held for time with weight (e.g., Weighted Plank, Farmer's Carry)

Guidelines:
- Be specific and actionable - avoid vague instructions
- Base guidance on evidence-based training principles (e.g. the kind of research summarised by Built With Science)
- Return one object per input exercise inside "exercises", in the same order as the input list

Output: a JSON object matching the provided schema — {"exercises": [...]}.`;

function detailsCacheMaterial(name: string) {
  return { name: normalizeCacheText(name), v: DETAILS_CACHE_VERSION };
}

export async function generateExerciseDetails(
  exerciseName: string,
): Promise<AIExerciseResponse> {
  const [first] = await generateExerciseDetailsBatch([exerciseName]);
  if (!first) {
    throw new Error('AI returned no exercise details');
  }
  return first;
}

/**
 * Details for each name, aligned by index with the input. Cached names are
 * served locally; only the misses are sent, in one call. An entry the model
 * failed to return is left undefined (callers already check each index).
 */
export async function generateExerciseDetailsBatch(
  exerciseNames: string[],
): Promise<AIExerciseResponse[]> {
  const results: (AIExerciseResponse | undefined)[] = exerciseNames.map(
    (name) =>
      readAICache(DETAILS_CACHE_NAMESPACE, detailsCacheMaterial(name), {
        ttlMs: DETAILS_CACHE_TTL_MS,
        schema: exerciseDetailsSchema,
      }),
  );

  const missIndices = results.flatMap((r, i) => (r ? [] : [i]));
  if (missIndices.length > 0) {
    const missNames = missIndices.map((i) => exerciseNames[i]);
    const { exercises } = await complete({
      instructions: EXERCISE_DETAILS_INSTRUCTIONS,
      prompt: missNames.map((name, i) => `${i + 1}. ${name}`).join('\n'),
      schema: exerciseDetailsBatchSchema,
      schemaName: 'exercise_details_batch',
    });
    missIndices.forEach((inputIndex, j) => {
      const detail = exercises[j];
      if (!detail) return;
      results[inputIndex] = detail;
      writeAICache(
        DETAILS_CACHE_NAMESPACE,
        detailsCacheMaterial(exerciseNames[inputIndex]),
        detail,
        DETAILS_CACHE_TTL_MS,
      );
    });
  }

  // Holes stay undefined at runtime (same as a short model response before);
  // callers guard each index.
  return results as AIExerciseResponse[];
}

// ============================================================================
// Duplicate detection — local pre-filter, then ONE batched AI call for only
// the ambiguous candidates.
// ============================================================================

const ABBREVIATIONS: Record<string, string> = {
  db: 'dumbbell',
  dbs: 'dumbbell',
  bb: 'barbell',
  kb: 'kettlebell',
  ohp: 'overhead press',
  rdl: 'romanian deadlift',
  bw: 'bodyweight',
};
const STOPWORDS = new Set(['the', 'a', 'an', 'with', 'on', 'and', 'of', 'to']);

/** Lowercase, strip punctuation, expand gym abbreviations, crude singular. */
export function exerciseNameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[-_/]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((tok) => (ABBREVIATIONS[tok] ?? tok).split(' '))
    .filter((tok) => !STOPWORDS.has(tok))
    .map(singularize);
}

function singularize(tok: string): string {
  if (tok.length <= 3) return tok;
  if (/(sses|shes|ches|xes)$/.test(tok)) return tok.slice(0, -2);
  if (tok.endsWith('s') && !tok.endsWith('ss')) return tok.slice(0, -1);
  return tok;
}

function normalizedExerciseName(name: string): string {
  return exerciseNameTokens(name).sort().join(' ');
}

// Words that describe nearly every exercise; sharing only these does not
// make two exercises look alike.
const GENERIC_TOKENS = new Set([
  'dumbbell',
  'barbell',
  'cable',
  'machine',
  'kettlebell',
  'band',
  'bodyweight',
  'single',
  'arm',
  'leg',
  'seated',
  'standing',
  'incline',
  'decline',
  'weighted',
]);

const MAX_AMBIGUOUS_PER_CANDIDATE = 8;

export interface DuplicateScreen {
  /** Same exercise by normalised name — no AI needed. */
  certain: Exercise[];
  /** Share a meaningful word — the AI decides. */
  ambiguous: Exercise[];
}

/** Pure local screen of one candidate name against the library. */
export function screenDuplicates(
  candidateName: string,
  existingExercises: Exercise[],
): DuplicateScreen {
  const candidateNorm = normalizedExerciseName(candidateName);
  const candidateTokens = new Set(exerciseNameTokens(candidateName));
  const certain: Exercise[] = [];
  const scored: { ex: Exercise; score: number }[] = [];

  for (const ex of existingExercises) {
    if (normalizedExerciseName(ex.name) === candidateNorm) {
      certain.push(ex);
      continue;
    }
    const tokens = new Set(exerciseNameTokens(ex.name));
    const shared = [...candidateTokens].filter((t) => tokens.has(t));
    const meaningful = shared.filter((t) => !GENERIC_TOKENS.has(t));
    if (meaningful.length === 0) continue;
    const union = new Set([...candidateTokens, ...tokens]).size;
    scored.push({ ex, score: shared.length / union });
  }

  scored.sort((a, b) => b.score - a.score);
  return {
    certain,
    ambiguous: scored
      .filter(({ score }) => score >= 0.25)
      .slice(0, MAX_AMBIGUOUS_PER_CANDIDATE)
      .map(({ ex }) => ex),
  };
}

const duplicateJudgementSchema = z.object({
  results: z.array(
    z.object({
      candidate: z.number(),
      duplicate_options: z.array(z.number()),
    }),
  ),
});

const DUPLICATE_INSTRUCTIONS = `You help manage a personal exercise library. For each numbered candidate, decide which of its listed options are the same exercise or a very close duplicate (same movement pattern; only trivial naming differences). Different variations that train differently (e.g. incline vs flat press, front vs back squat) are NOT duplicates.

Output: a JSON object matching the provided schema — one entry per candidate with "candidate" (its number) and "duplicate_options" (the matching option numbers, 1-based; empty if none).`;

const DUPLICATE_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;

/**
 * Likely duplicates for several candidate names, keyed by candidate name.
 * Exact (normalised) name matches are resolved locally; only candidates with
 * ambiguous near-matches go to the AI, all in ONE call. Low-stakes: on AI
 * failure, only the local matches are returned.
 */
export async function findDuplicateExercisesBatch(
  candidateNames: string[],
  existingExercises: Exercise[],
): Promise<Record<string, Exercise[]>> {
  const out: Record<string, Exercise[]> = {};
  if (existingExercises.length === 0) return out;

  const toJudge: { name: string; options: Exercise[] }[] = [];
  for (const name of new Set(candidateNames)) {
    const { certain, ambiguous } = screenDuplicates(name, existingExercises);
    if (certain.length > 0) {
      out[name] = certain;
    } else if (ambiguous.length > 0) {
      toJudge.push({ name, options: ambiguous });
    }
  }
  if (toJudge.length === 0) return out;

  const prompt = toJudge
    .map(
      ({ name, options }, i) =>
        `Candidate ${i + 1}: "${name}"\n${options
          .map(
            (ex, j) =>
              `  ${j + 1}. ${ex.name} | ${ex.muscle_groups ?? ''} | ${ex.equipment ?? ''}`,
          )
          .join('\n')}`,
    )
    .join('\n\n');

  try {
    const { results } = await complete({
      instructions: DUPLICATE_INSTRUCTIONS,
      prompt,
      schema: duplicateJudgementSchema,
      schemaName: 'duplicate_judgement',
      temperature: 0,
      cache: { namespace: 'duplicate_check', ttlMs: DUPLICATE_CACHE_TTL_MS },
    });
    for (const { candidate, duplicate_options } of results) {
      const entry = toJudge[candidate - 1];
      if (!entry) continue;
      const matches = duplicate_options
        .filter((n) => Number.isInteger(n) && n >= 1)
        .map((n) => entry.options[n - 1])
        .filter((ex): ex is Exercise => ex !== undefined);
      if (matches.length > 0) out[entry.name] = matches;
    }
  } catch (error) {
    console.error('Duplicate exercise check failed', error);
  }
  return out;
}

export async function findDuplicateExercises(
  candidateName: string,
  existingExercises: Exercise[],
): Promise<Exercise[]> {
  const result = await findDuplicateExercisesBatch(
    [candidateName],
    existingExercises,
  );
  return result[candidateName] ?? [];
}
