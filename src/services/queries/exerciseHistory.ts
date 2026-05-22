/**
 * Exercise History query module
 *
 * Collapses the N+1 "find workout logs then loop for sets per log" pattern into
 * a single SQL query using `json_agg`.
 *
 * Provides a unified `sessions()` function that all exercise-history consumers
 * call — each consumer applies a thin adapter to extract the shape it needs:
 *
 *   getLastPerformance   → sessions(db, id, { completedSetsOnly: true, limit: 1, excludeWorkoutLogId })
 *   getRecentBySession   → sessions(db, id, { completedWorkoutsOnly: true, limit: n })
 *   getExerciseHistory   → sessions(db, id, { limit: n })
 *
 * ## What is json_agg?
 *
 * `json_agg(expression)` collects values into a JSON array across grouped rows.
 * With `json_build_object(...)` it lets us nest the sets array directly inside
 * each session row in one query, instead of issuing a separate query per log.
 */

import type { PGlite } from '@electric-sql/pglite';
import type { WorkoutSet } from '../../types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExerciseSession {
  workoutLogId: number;
  date: string;
  sets: WorkoutSet[];
}

export interface SessionQueryOptions {
  /** Maximum number of sessions to return. */
  limit?: number;
  /** Only include sets where completed_at IS NOT NULL (set-level filter). */
  completedSetsOnly?: boolean;
  /** Only include workout logs marked as completed (workout-level filter). */
  completedWorkoutsOnly?: boolean;
  /** Exclude a specific workout log (e.g. the one currently in progress). */
  excludeWorkoutLogId?: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch past sessions that included a specific exercise, with sets nested
 * inline via json_agg. One SQL round-trip regardless of session count.
 *
 * Results are ordered most-recent-first. Call-site adapters can `.reverse()`
 * if they need chronological order.
 */
export async function sessions(
  db: PGlite,
  exerciseId: number,
  opts: SessionQueryOptions = {},
): Promise<ExerciseSession[]> {
  const {
    limit,
    completedSetsOnly = false,
    completedWorkoutsOnly = false,
    excludeWorkoutLogId,
  } = opts;

  // Build WHERE clauses dynamically based on options
  const conditions: string[] = ['ws.exercise_id = $1'];
  const params: (number | string)[] = [exerciseId];
  let paramIdx = 2;

  if (completedSetsOnly) {
    conditions.push('ws.completed_at IS NOT NULL');
  }

  if (completedWorkoutsOnly) {
    conditions.push("(wl.status = 'completed' OR wl.ended_at IS NOT NULL)");
  }

  if (excludeWorkoutLogId != null) {
    conditions.push(`wl.id != $${paramIdx}`);
    params.push(excludeWorkoutLogId);
    paramIdx++;
  }

  let limitClause = '';
  if (limit != null) {
    limitClause = `LIMIT $${paramIdx}`;
    params.push(limit);
  }

  const result = await db.query(
    `SELECT
       wl.id AS workout_log_id,
       wl.date,
       COALESCE(
         json_agg(
           json_build_object(
             'id', ws.id,
             'workout_log_id', ws.workout_log_id,
             'exercise_id', ws.exercise_id,
             'workout_log_exercise_id', ws.workout_log_exercise_id,
             'set_number', ws.set_number,
             'reps', ws.reps,
             'weight_kg', ws.weight_kg,
             'duration_seconds', ws.duration_seconds,
             'notes', ws.notes,
             'completed_at', ws.completed_at,
             'created_at', ws.created_at
           )
           ORDER BY ws.set_number
         ) FILTER (WHERE ws.id IS NOT NULL),
         '[]'::json
       ) AS sets
     FROM workout_logs wl
     JOIN workout_sets ws ON wl.id = ws.workout_log_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY wl.id, wl.date
     ORDER BY wl.date DESC, wl.id DESC
     ${limitClause}`,
    params,
  );

  return (result.rows as Record<string, unknown>[]).map(parseSessionRow);
}

// ---------------------------------------------------------------------------
// Row parser
// ---------------------------------------------------------------------------

function parseSessionRow(row: Record<string, unknown>): ExerciseSession {
  const rawSets = row.sets;
  const sets =
    typeof rawSets === 'string' ? JSON.parse(rawSets) : (rawSets ?? []);

  return {
    workoutLogId: row.workout_log_id as number,
    date: dateToString(row.date),
    sets,
  };
}

/** PGlite may return DATE columns as Date objects — normalise to YYYY-MM-DD. */
function dateToString(val: unknown): string {
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return String(val ?? '');
}
