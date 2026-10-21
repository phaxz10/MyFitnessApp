import type { Queryable as DB } from '../db';

export interface ExerciseUsage {
  /** Workout Logs that include this Exercise. */
  workouts: number;
  /** Programs with a Session that uses this Exercise. */
  programs: number;
}

/** How much history and planning hangs off one Exercise (one round-trip). */
export async function exerciseUsage(
  db: DB,
  exerciseId: number,
): Promise<ExerciseUsage> {
  const result = await db.query<ExerciseUsage>(
    `SELECT
       (SELECT COUNT(DISTINCT workout_log_id)::int FROM (
          SELECT workout_log_id FROM workout_sets WHERE exercise_id = $1
          UNION
          SELECT workout_log_id FROM workout_log_exercises WHERE exercise_id = $1
        ) logs) AS workouts,
       (SELECT COUNT(DISTINCT ps.program_id)::int
          FROM program_exercises pe
          JOIN program_sessions ps ON ps.id = pe.session_id
          WHERE pe.exercise_id = $1) AS programs`,
    [exerciseId],
  );
  return result.rows[0];
}
