import type { WorkoutLogExercise } from '../../types';
import type { DB } from '../db';

interface ProgramRow {
  id: number;
  exercise_id: number;
}

/**
 * Pair each Workout Log Exercise with the Program Exercise it came from:
 * by program_exercise_id (stored at workout start, migration v8), else, for
 * rows without one, the first unclaimed program row with the same Exercise.
 * Returns wle.id -> program_exercises.id for the matched rows.
 */
export function matchToProgram(
  workoutRows: readonly Pick<
    WorkoutLogExercise,
    'id' | 'exercise_id' | 'program_exercise_id'
  >[],
  programRows: readonly ProgramRow[],
): Map<number, number> {
  const matches = new Map<number, number>();
  const claimed = new Set<number>();
  const byId = new Set(programRows.map((pe) => pe.id));

  for (const wle of workoutRows) {
    const peId = wle.program_exercise_id;
    if (peId != null && byId.has(peId) && !claimed.has(peId)) {
      matches.set(wle.id, peId);
      claimed.add(peId);
    }
  }
  for (const wle of workoutRows) {
    if (matches.has(wle.id) || wle.program_exercise_id != null) continue;
    const pe = programRows.find(
      (p) => p.exercise_id === wle.exercise_id && !claimed.has(p.id),
    );
    if (pe) {
      matches.set(wle.id, pe.id);
      claimed.add(pe.id);
    }
  }
  return matches;
}

/**
 * Rewrite a Session's Program Exercises to match a performed workout: same
 * exercises, order, superset grouping, and the set count actually done. One
 * transaction.
 *
 * @param setCounts workout_log_exercise_id -> sets actually performed
 */
export async function syncSessionFromWorkout(
  db: DB,
  sessionId: number,
  workoutRows: readonly WorkoutLogExercise[],
  setCounts: ReadonlyMap<number, number>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const current = await tx.query<ProgramRow>(
      'SELECT id, exercise_id FROM program_exercises WHERE session_id = $1 ORDER BY order_index',
      [sessionId],
    );
    const matches = matchToProgram(workoutRows, current.rows);
    const kept = new Set(matches.values());

    const removed = current.rows
      .filter((pe) => !kept.has(pe.id))
      .map((pe) => pe.id);
    if (removed.length > 0) {
      await tx.query(
        'DELETE FROM program_exercises WHERE id = ANY($1::int[])',
        [removed],
      );
    }

    // Workout superset ids become stable per-session program ids.
    const groupIds = new Map<string, string>();
    for (const wle of workoutRows) {
      if (wle.superset_group_id && !groupIds.has(wle.superset_group_id)) {
        groupIds.set(
          wle.superset_group_id,
          `ss-prog-${sessionId}-${groupIds.size + 1}`,
        );
      }
    }

    for (let i = 0; i < workoutRows.length; i++) {
      const wle = workoutRows[i];
      const targetSets = setCounts.get(wle.id) || wle.target_sets || 3;
      const groupId = wle.superset_group_id
        ? (groupIds.get(wle.superset_group_id) ?? null)
        : null;
      const peId = matches.get(wle.id);

      if (peId !== undefined) {
        await tx.query(
          `UPDATE program_exercises
           SET target_sets = $1, target_rep_min = $2, target_rep_max = $3,
               target_duration_seconds = $4, order_index = $5, superset_group_id = $6
           WHERE id = $7`,
          [
            targetSets,
            wle.target_rep_min,
            wle.target_rep_max,
            wle.target_duration_seconds,
            i,
            groupId,
            peId,
          ],
        );
      } else {
        await tx.query(
          `INSERT INTO program_exercises
           (session_id, exercise_id, target_sets, target_rep_min, target_rep_max,
            target_duration_seconds, order_index, superset_group_id, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            sessionId,
            wle.exercise_id,
            targetSets,
            wle.target_rep_min,
            wle.target_rep_max,
            wle.target_duration_seconds,
            i,
            groupId,
            wle.notes,
          ],
        );
      }
    }
  });
}

/** Make one Program the active one (a single statement, so atomic). */
export async function setActiveProgram(db: DB, id: number): Promise<void> {
  await db.query('UPDATE workout_programs SET is_active = (id = $1)', [id]);
}
