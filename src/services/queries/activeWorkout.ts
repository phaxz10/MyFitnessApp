import type { WorkoutLog } from '../../types';
import type { Queryable as DB } from '../db';

/**
 * The in-progress Workout Log to resume, whatever its date: a workout that
 * crosses midnight is still the one in progress. `preferDate` (the ?date of a
 * past-day log) only breaks a tie; at most one is in progress (migration v9),
 * apart from legacy rows with a NULL status and no ended_at.
 */
export async function findResumable(
  db: DB,
  opts: { preferDate?: string } = {},
): Promise<WorkoutLog | null> {
  const result = await db.query<WorkoutLog>(
    `SELECT * FROM workout_logs
     WHERE status = 'in_progress' OR (status IS NULL AND ended_at IS NULL)
     ORDER BY COALESCE(date = $1::date, false) DESC, started_at DESC
     LIMIT 1`,
    [opts.preferDate ?? null],
  );
  return result.rows[0] ?? null;
}
