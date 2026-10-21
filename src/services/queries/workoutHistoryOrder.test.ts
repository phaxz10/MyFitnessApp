import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../test/testDb';
import type { DB } from '../db';
import { deleteSets, instantiateSession } from '../writers/workoutWriter';
import { recent, setsForWorkout } from './workoutHistory';

let pg: PGlite;
let db: DB;

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
});

afterEach(async () => {
  await pg.close();
});

// Superset of two exercises, 3 rounds. Round 1 logged, round 2 deleted (the
// rest renumbered), round 3 completed from placeholders. Every set shares one
// created_at (one INSERT), and UPDATEs move rows around the heap, so history
// must order by set_number, never by created_at or physical order.
async function seedSupersetSession(): Promise<number> {
  await db.exec(`
    INSERT INTO exercises (id, name) VALUES (1, 'Bench'), (2, 'Row');
    INSERT INTO workout_programs (id, name, sessions_per_week) VALUES (1, 'P', 3);
    INSERT INTO program_sessions (id, program_id, name, order_index) VALUES (1, 1, 'S', 0);
    INSERT INTO program_exercises
      (session_id, exercise_id, target_sets, target_rep_min, target_rep_max, order_index, superset_group_id)
    VALUES (1, 1, 3, 8, 12, 0, 'ss'), (1, 2, 3, 8, 12, 1, 'ss');
  `);
  const log = await db.query<{ id: number }>(
    `INSERT INTO workout_logs (program_id, session_id, date, started_at, status)
     VALUES (1, 1, '2025-06-01', '2025-06-01T09:00:00', 'completed') RETURNING id`,
  );
  const logId = log.rows[0].id;
  const { sets } = await instantiateSession(db, logId, 1);
  const round = (n: number) => sets.filter((s) => s.set_number === n);

  for (const s of round(1)) {
    await db.query(
      `UPDATE workout_sets SET weight_kg = 60, reps = 10, completed_at = NOW() WHERE id = $1`,
      [s.id],
    );
  }
  await deleteSets(
    db,
    round(2).map((s) => s.id),
  );
  // Round 3 (now set_number 2) completes last, from placeholders.
  for (const s of round(3)) {
    await db.query(
      `UPDATE workout_sets SET weight_kg = 50, reps = 12, completed_at = NOW() WHERE id = $1`,
      [s.id],
    );
  }
  // The user then corrects round 1: the UPDATE moves those rows to the end of
  // the heap, after round 3.
  for (const s of round(1)) {
    await db.query(`UPDATE workout_sets SET notes = 'edited' WHERE id = $1`, [
      s.id,
    ]);
  }
  // Every set was INSERTed in one statement, so created_at is a tie and the
  // order it yields is arbitrary (heap order, shifted by the UPDATEs above).
  // Model the unlucky outcome explicitly: later rounds sort first.
  await db.query(
    `UPDATE workout_sets
       SET created_at = TIMESTAMP '2025-06-01 09:00:00' - set_number * INTERVAL '1 second'
     WHERE workout_log_id = $1`,
    [logId],
  );
  return logId;
}

describe('set order in history', () => {
  it('recent() lists each exercise sets by set_number', async () => {
    await seedSupersetSession();
    const [log] = await recent(db, 1);
    for (const exerciseId of [1, 2]) {
      const mine = log.sets.filter((s) => s.exercise_id === exerciseId);
      expect(mine.map((s) => s.set_number)).toEqual([1, 2]);
      expect(mine.map((s) => s.weight_kg)).toEqual([60, 50]);
    }
  });

  it('setsForWorkout() lists sets by exercise order then set_number', async () => {
    const logId = await seedSupersetSession();
    const sets = await setsForWorkout(db, logId);
    expect(sets.map((s) => [s.exercise_id, s.set_number])).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2],
    ]);
  });
});
