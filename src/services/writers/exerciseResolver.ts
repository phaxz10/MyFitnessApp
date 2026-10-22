import type { AIExerciseResponse, Exercise } from '../../types';
import { generateExerciseDetailsBatch } from '../coaching/exerciseLibraryCoach';
import type { DB } from '../db';

// Turn exercise names (from the AI or typed by the user) into library rows.
// Names already in the library are reused; the rest are created, with AI
// details when they can be had and a minimal row when not, so a program can
// always be built, even from an empty library.

export interface ExerciseRequest {
  name: string;
  /** Details already known (e.g. from the generator's create_exercises). */
  details?: AIExerciseResponse;
}

/** Fetches details aligned by index with `names`; holes are undefined. */
export type ExerciseDetailsFetcher = (
  names: string[],
) => Promise<(AIExerciseResponse | undefined)[]>;

/** Trimmed, single-spaced, lower-cased: the key names are matched on. */
export function normalizeExerciseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Map every requested name (normalized) to a library exercise, creating the
 * missing ones in ONE transaction. Archived rows are never matched. Missing
 * details are fetched in one batched call; if that fails the exercise is
 * still created, as a plain reps-and-weight row.
 */
export async function resolveExercises(
  db: DB,
  requests: ExerciseRequest[],
  library: Exercise[],
  fetchDetails: ExerciseDetailsFetcher = generateExerciseDetailsBatch,
): Promise<Map<string, Exercise>> {
  const resolved = new Map<string, Exercise>();
  const byName = new Map<string, Exercise>();
  for (const exercise of library) {
    if (exercise.archived_at) continue;
    const key = normalizeExerciseName(exercise.name);
    if (!byName.has(key)) byName.set(key, exercise);
  }

  // Misses, deduped by normalized name; the first spelling wins, and details
  // from any duplicate request fill in.
  const misses = new Map<string, ExerciseRequest>();
  for (const request of requests) {
    const key = normalizeExerciseName(request.name);
    if (!key) continue;
    const match = byName.get(key);
    if (match) {
      resolved.set(key, match);
      continue;
    }
    const pending = misses.get(key);
    if (!pending) {
      misses.set(key, {
        name: request.name.trim().replace(/\s+/g, ' '),
        details: request.details,
      });
    } else if (!pending.details && request.details) {
      pending.details = request.details;
    }
  }
  if (misses.size === 0) return resolved;

  const needDetails = [...misses.values()].filter((m) => !m.details);
  if (needDetails.length > 0) {
    let fetched: (AIExerciseResponse | undefined)[] = [];
    try {
      fetched = await fetchDetails(needDetails.map((m) => m.name));
    } catch (err) {
      // Offline, no key, or the model failed: create minimal rows instead.
      console.warn('Exercise details unavailable:', err);
    }
    needDetails.forEach((m, i) => {
      m.details = fetched[i];
    });
  }

  await db.transaction(async (tx) => {
    for (const [key, { name, details }] of misses) {
      const result = await tx.query<Exercise>(
        `INSERT INTO exercises (name, description, muscle_groups, equipment, video_url, exercise_type, is_ai_generated)
         VALUES ($1, $2, $3, $4, NULL, $5, true)
         RETURNING *`,
        [
          name,
          details?.description ?? null,
          details?.muscle_groups.length
            ? details.muscle_groups.join(', ')
            : null,
          details?.equipment ?? null,
          details?.exercise_type ?? 'reps_weight',
        ],
      );
      resolved.set(key, result.rows[0]);
    }
  });
  return resolved;
}
