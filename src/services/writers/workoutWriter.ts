import type { WorkoutLogExercise, WorkoutSet } from '../../types';
import type { DB } from '../db';

export interface AddExerciseOpts {
  orderIndex: number;
  supersetGroupId?: string | null;
  targetSets?: number | null;
  targetRepMin?: number | null;
  targetRepMax?: number | null;
  targetDurationSeconds?: number | null;
  notes?: string | null;
}

/**
 * Instantiate a workout from a program session template.
 *
 * Two SQL statements replace the doubly-nested loop that previously did
 * ~5 exercises × 3 sets = ~20 serial INSERTs:
 *
 * 1. INSERT...SELECT copies program_exercises into workout_log_exercises.
 * 2. INSERT...SELECT with generate_series pre-creates empty workout_sets
 *    for each exercise based on its target_sets count.
 */
export async function instantiateSession(
  db: DB,
  workoutLogId: number,
  sessionId: number,
): Promise<{ exercises: WorkoutLogExercise[]; sets: WorkoutSet[] }> {
  const exerciseResult = await db.query(
    `INSERT INTO workout_log_exercises
       (workout_log_id, exercise_id, order_index, superset_group_id,
        target_sets, target_rep_min, target_rep_max, target_duration_seconds, notes)
     SELECT $1, exercise_id, order_index, superset_group_id,
            target_sets, target_rep_min, target_rep_max, target_duration_seconds, notes
     FROM program_exercises
     WHERE session_id = $2
     ORDER BY order_index
     RETURNING *`,
    [workoutLogId, sessionId],
  );

  const exercises = exerciseResult.rows as WorkoutLogExercise[];

  if (exercises.length === 0) {
    return { exercises: [], sets: [] };
  }

  // generate_series(1, target_sets) creates one row per set number per exercise
  const setResult = await db.query(
    `INSERT INTO workout_sets
       (workout_log_id, exercise_id, workout_log_exercise_id, set_number,
        reps, weight_kg, duration_seconds, completed_at)
     SELECT wle.workout_log_id, wle.exercise_id, wle.id, gs.n,
            NULL, NULL, NULL, NULL
     FROM workout_log_exercises wle
     CROSS JOIN LATERAL generate_series(1, COALESCE(wle.target_sets, 3)) AS gs(n)
     WHERE wle.workout_log_id = $1
     RETURNING *`,
    [workoutLogId],
  );

  return { exercises, sets: setResult.rows as WorkoutSet[] };
}

/**
 * Add a single exercise to an in-progress workout and pre-create its empty sets.
 *
 * Two SQL statements replace the loop that previously did 1 + N serial INSERTs
 * (1 for the exercise row, N for each target set).
 */
export async function addExercise(
  db: DB,
  workoutLogId: number,
  exerciseId: number,
  opts: AddExerciseOpts,
): Promise<{ exercise: WorkoutLogExercise; sets: WorkoutSet[] }> {
  const targetSets = opts.targetSets ?? 3;

  const exerciseResult = await db.query(
    `INSERT INTO workout_log_exercises
       (workout_log_id, exercise_id, order_index, superset_group_id,
        target_sets, target_rep_min, target_rep_max, target_duration_seconds, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      workoutLogId,
      exerciseId,
      opts.orderIndex,
      opts.supersetGroupId ?? null,
      targetSets,
      opts.targetRepMin ?? null,
      opts.targetRepMax ?? null,
      opts.targetDurationSeconds ?? null,
      opts.notes ?? null,
    ],
  );

  const exercise = (exerciseResult.rows as WorkoutLogExercise[])[0];

  const setResult = await db.query(
    `INSERT INTO workout_sets
       (workout_log_id, exercise_id, workout_log_exercise_id, set_number,
        reps, weight_kg, duration_seconds, completed_at)
     SELECT $1, $2, $3, gs.n, NULL, NULL, NULL, NULL
     FROM generate_series(1, $4) AS gs(n)
     RETURNING *`,
    [workoutLogId, exerciseId, exercise.id, targetSets],
  );

  return { exercise, sets: setResult.rows as WorkoutSet[] };
}
