import type { WorkoutLog, WorkoutLogExercise, WorkoutSet } from '../../types';
import { toLocalTimestamp } from '../../utils/date';
import type { DB } from '../db';
import { findResumable } from '../queries/activeWorkout';

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
 * 1. INSERT...SELECT copies program_exercises into workout_log_exercises,
 *    keeping each row's program_exercise_id for syncing back later.
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
        target_sets, target_rep_min, target_rep_max, target_duration_seconds, notes,
        program_exercise_id)
     SELECT $1, exercise_id, order_index, superset_group_id,
            target_sets, target_rep_min, target_rep_max, target_duration_seconds, notes,
            id
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

export interface StartWorkoutOpts {
  programId: number | null;
  sessionId: number | null;
  date: string;
  startedAt: string;
}

/**
 * Start a Workout Log and, from a Session, its exercises and empty sets, in
 * one transaction. If a workout is already in progress it is returned instead
 * of starting a second one (a double tap on Start), backed by the
 * one-in-progress unique index (migration v9).
 */
export async function startWorkout(
  db: DB,
  opts: StartWorkoutOpts,
): Promise<WorkoutLog> {
  return db.transaction(async (tx) => {
    const existing = await findResumable(tx);
    if (existing) return existing;

    const result = await tx.query<WorkoutLog>(
      `INSERT INTO workout_logs (program_id, session_id, date, started_at, status)
       VALUES ($1, $2, $3, $4, 'in_progress')
       RETURNING *`,
      [opts.programId, opts.sessionId, opts.date, opts.startedAt],
    );
    const workout = result.rows[0];
    if (opts.sessionId) {
      await instantiateSession(tx, workout.id, opts.sessionId);
    }
    return workout;
  });
}

/** An in-progress workout untouched this long is abandoned. */
export const STALE_AFTER_HOURS = 12;

/**
 * Close out abandoned in-progress Workout Logs (started more than
 * STALE_AFTER_HOURS before `now`, so one that crosses midnight survives) in a
 * single UPDATE: 'incomplete' if any set was completed, else 'missed'. Empty
 * pre-created template sets do not count.
 */
export async function markStaleWorkouts(db: DB, now: Date): Promise<void> {
  const cutoff = toLocalTimestamp(
    new Date(now.getTime() - STALE_AFTER_HOURS * 3600_000),
  );
  await db.query(
    `UPDATE workout_logs wl SET status = CASE
         WHEN EXISTS (
           SELECT 1 FROM workout_sets ws
           WHERE ws.workout_log_id = wl.id AND ws.completed_at IS NOT NULL
         ) THEN 'incomplete'
         ELSE 'missed'
       END
     WHERE (wl.status = 'in_progress' OR (wl.status IS NULL AND wl.ended_at IS NULL))
       AND wl.started_at < $1`,
    [cutoff],
  );
}

/**
 * Delete exactly these Sets (by id) and renumber each affected exercise's
 * remaining sets 1..n, in one transaction.
 */
export async function deleteSets(
  db: DB,
  setIds: readonly number[],
): Promise<void> {
  if (setIds.length === 0) return;
  await db.transaction(async (tx) => {
    const deleted = await tx.query<{ workout_log_exercise_id: number | null }>(
      `DELETE FROM workout_sets WHERE id = ANY($1::int[])
       RETURNING workout_log_exercise_id`,
      [setIds],
    );
    const wleIds = [
      ...new Set(
        deleted.rows
          .map((r) => r.workout_log_exercise_id)
          .filter((id): id is number => id !== null),
      ),
    ];
    if (wleIds.length === 0) return;
    await tx.query(
      `UPDATE workout_sets ws SET set_number = r.rn
       FROM (
         SELECT id, ROW_NUMBER() OVER (
           PARTITION BY workout_log_exercise_id ORDER BY set_number, id
         ) AS rn
         FROM workout_sets WHERE workout_log_exercise_id = ANY($1::int[])
       ) r
       WHERE ws.id = r.id AND ws.set_number <> r.rn`,
      [wleIds],
    );
  });
}

/** Append one empty Set to a Workout Log Exercise. */
export async function addSet(
  db: DB,
  workoutLogExerciseId: number,
): Promise<WorkoutSet> {
  const result = await db.query<WorkoutSet>(
    `INSERT INTO workout_sets
       (workout_log_id, exercise_id, workout_log_exercise_id, set_number)
     SELECT wle.workout_log_id, wle.exercise_id, wle.id,
            (SELECT COALESCE(MAX(set_number), 0) + 1 FROM workout_sets
             WHERE workout_log_exercise_id = wle.id)
     FROM workout_log_exercises wle
     WHERE wle.id = $1
     RETURNING *`,
    [workoutLogExerciseId],
  );
  const set = result.rows[0];
  if (!set) throw new Error('Workout log exercise not found');
  return set;
}

/**
 * Add a round to a Superset: one empty Set per member, all with the same
 * set_number (one past the group's highest). A single INSERT...SELECT, so it
 * is all-or-nothing.
 */
export async function addSupersetRound(
  db: DB,
  workoutLogId: number,
  supersetGroupId: string,
): Promise<WorkoutSet[]> {
  const result = await db.query<WorkoutSet>(
    `INSERT INTO workout_sets
       (workout_log_id, exercise_id, workout_log_exercise_id, set_number)
     SELECT wle.workout_log_id, wle.exercise_id, wle.id,
            (SELECT COALESCE(MAX(ws.set_number), 0) + 1
             FROM workout_sets ws
             JOIN workout_log_exercises g ON g.id = ws.workout_log_exercise_id
             WHERE g.workout_log_id = $1 AND g.superset_group_id = $2)
     FROM workout_log_exercises wle
     WHERE wle.workout_log_id = $1 AND wle.superset_group_id = $2
     ORDER BY wle.order_index
     RETURNING *`,
    [workoutLogId, supersetGroupId],
  );
  return result.rows;
}

/** Delete Workout Log Exercises (their Sets cascade) in one statement. */
export async function deleteWorkoutLogExercises(
  db: DB,
  ids: readonly number[],
): Promise<void> {
  if (ids.length === 0) return;
  await db.query(
    'DELETE FROM workout_log_exercises WHERE id = ANY($1::int[])',
    [ids],
  );
}
