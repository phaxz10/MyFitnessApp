import type { DB } from '../db';

export type RemoveOutcome = 'deleted' | 'archived';

/**
 * Remove a library Exercise without touching history. It leaves every
 * Program; then, if any Set, Workout Log Exercise or note references it, it is
 * archived (hidden from the library and pickers, still shown in history and
 * progress). Otherwise the row is really deleted. One transaction.
 */
export async function removeExercise(
  db: DB,
  id: number,
): Promise<RemoveOutcome> {
  return db.transaction(async (tx) => {
    await tx.query('DELETE FROM program_exercises WHERE exercise_id = $1', [
      id,
    ]);
    const archived = await tx.query(
      `UPDATE exercises SET archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP)
       WHERE id = $1 AND (
         EXISTS (SELECT 1 FROM workout_sets WHERE exercise_id = $1)
         OR EXISTS (SELECT 1 FROM workout_log_exercises WHERE exercise_id = $1)
         OR EXISTS (SELECT 1 FROM exercise_notes WHERE exercise_id = $1)
       )
       RETURNING id`,
      [id],
    );
    if (archived.rows.length > 0) return 'archived';
    await tx.query('DELETE FROM exercises WHERE id = $1', [id]);
    return 'deleted';
  });
}
