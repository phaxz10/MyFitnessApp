/**
 * Workout History query module
 *
 * Collapses the N+1 "fetch logs then loop for sets" pattern into a single SQL
 * query using `json_agg`. Instead of 1 + N round-trips to PGlite (one per
 * workout log to fetch its sets), we get everything in one shot.
 *
 * ## What is json_agg?
 *
 * `json_agg(expression)` is a PostgreSQL aggregate that collects all values of
 * `expression` across the grouped rows into a JSON array. Combined with
 * `json_build_object(key, value, ...)` it lets us nest structured data (the
 * workout sets) directly inside each parent row (the workout log).
 *
 * The `FILTER (WHERE ws.id IS NOT NULL)` clause prevents LEFT JOIN null rows
 * from producing `[null]` — and `COALESCE(..., '[]'::json)` ensures logs with
 * zero sets return an empty array instead of SQL NULL.
 */

import type { WorkoutStatus } from '../../types';
import type { DB } from '../db';
import type { WorkoutLogWithSets } from './types';

// ---------------------------------------------------------------------------
// Shared SQL fragments
// ---------------------------------------------------------------------------

const SELECT_AND_JOIN = `
  SELECT
    wl.id, wl.program_id, wl.session_id, wl.date,
    wl.started_at, wl.ended_at, wl.status, wl.notes, wl.created_at,
    ps.name AS session_name,
    wp.name AS program_name,
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
          'created_at', ws.created_at,
          'exercise_name', e.name
        )
        ORDER BY ws.created_at
      ) FILTER (WHERE ws.id IS NOT NULL),
      '[]'::json
    ) AS sets
  FROM workout_logs wl
  LEFT JOIN program_sessions ps ON wl.session_id = ps.id
  LEFT JOIN workout_programs wp ON wl.program_id = wp.id
  LEFT JOIN workout_sets ws ON wl.id = ws.workout_log_id
  LEFT JOIN exercises e ON ws.exercise_id = e.id`;

const GROUP_AND_ORDER = `
  GROUP BY wl.id, ps.name, wp.name
  ORDER BY wl.date DESC, wl.started_at DESC`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the N most recent workout logs with their sets nested inline.
 * One SQL round-trip regardless of how many logs are returned.
 */
export async function recent(
  db: DB,
  limit: number,
): Promise<WorkoutLogWithSets[]> {
  const result = await db.query(
    `${SELECT_AND_JOIN} ${GROUP_AND_ORDER} LIMIT $1`,
    [limit],
  );
  return (result.rows as Record<string, unknown>[]).map(parseLogRow);
}

/**
 * Fetch workout logs within a date range (inclusive) with nested sets.
 * One SQL round-trip.
 */
export async function inRange(
  db: DB,
  since: string,
  until: string,
): Promise<WorkoutLogWithSets[]> {
  const result = await db.query(
    `${SELECT_AND_JOIN} WHERE wl.date >= $1 AND wl.date <= $2 ${GROUP_AND_ORDER}`,
    [since, until],
  );
  return (result.rows as Record<string, unknown>[]).map(parseLogRow);
}

// ---------------------------------------------------------------------------
// Row parser
// ---------------------------------------------------------------------------

/**
 * Convert a raw query row into a typed WorkoutLogWithSets.
 * PGlite may return `json_agg` results as a parsed JS array or a JSON string —
 * we handle both.
 */
function parseLogRow(row: Record<string, unknown>): WorkoutLogWithSets {
  const rawSets = row.sets;
  const sets =
    typeof rawSets === 'string' ? JSON.parse(rawSets) : (rawSets ?? []);

  return {
    id: row.id as number,
    program_id: row.program_id as number | null,
    session_id: row.session_id as number | null,
    date: dateToString(row.date),
    started_at: String(row.started_at ?? ''),
    ended_at: row.ended_at != null ? String(row.ended_at) : null,
    status: row.status as WorkoutStatus,
    notes: row.notes as string | null,
    created_at: String(row.created_at ?? ''),
    session_name: (row.session_name as string) ?? undefined,
    program_name: (row.program_name as string) ?? undefined,
    sets,
  };
}

/** PGlite may return DATE columns as Date objects — normalise to YYYY-MM-DD. */
function dateToString(val: unknown): string {
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return String(val ?? '');
}
