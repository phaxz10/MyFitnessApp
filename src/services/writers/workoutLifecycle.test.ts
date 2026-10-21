import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../test/testDb';
import { type DB, onDbWrite, type WriteEvent } from '../db';
import { findResumable } from '../queries/activeWorkout';
import { markStaleWorkouts, startWorkout } from './workoutWriter';

let pg: PGlite;
let db: DB;
let events: WriteEvent[] = [];
onDbWrite((e) => events.push(e));

// 01:00 local on 2 June: just past midnight.
const NOW = new Date(2025, 5, 2, 1, 0, 0);

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
  events = [];
  await pg.exec(`
    INSERT INTO exercises (id, name) VALUES (1, 'Bench');
    INSERT INTO workout_programs (id, name, sessions_per_week) VALUES (1, 'P', 1);
    INSERT INTO program_sessions (id, program_id, name, order_index) VALUES (1, 1, 'Push', 0);
    INSERT INTO program_exercises (session_id, exercise_id, target_sets, order_index)
      VALUES (1, 1, 3, 0);
  `);
});

afterEach(async () => {
  await pg.close();
});

async function seedLog(
  date: string,
  startedAt: string,
  opts: { sets?: number; completed?: number } = {},
): Promise<number> {
  const log = await pg.query<{ id: number }>(
    `INSERT INTO workout_logs (date, started_at, status)
     VALUES ($1, $2, 'in_progress') RETURNING id`,
    [date, startedAt],
  );
  const id = log.rows[0].id;
  const sets = opts.sets ?? 3;
  const completed = opts.completed ?? 0;
  for (let n = 1; n <= sets; n++) {
    await pg.query(
      `INSERT INTO workout_sets (workout_log_id, exercise_id, set_number, reps, completed_at)
       VALUES ($1, 1, $2, $3, $4)`,
      [
        id,
        n,
        n <= completed ? 5 : null,
        n <= completed ? `${date}T09:30:00` : null,
      ],
    );
  }
  return id;
}

const statusOf = async (id: number) =>
  (
    await pg.query<{ status: string }>(
      'SELECT status FROM workout_logs WHERE id = $1',
      [id],
    )
  ).rows[0].status;

describe('markStaleWorkouts', () => {
  it('marks an abandoned workout with only empty template sets as missed', async () => {
    const id = await seedLog('2025-05-30', '2025-05-30T09:00:00');
    await markStaleWorkouts(db, NOW);
    expect(await statusOf(id)).toBe('missed');
  });

  it('marks an abandoned workout with a completed set as incomplete', async () => {
    const id = await seedLog('2025-05-30', '2025-05-30T09:00:00', {
      completed: 1,
    });
    await markStaleWorkouts(db, NOW);
    expect(await statusOf(id)).toBe('incomplete');
  });

  it('leaves a workout that crossed midnight (started 90 min ago) in progress', async () => {
    const id = await seedLog('2025-06-01', '2025-06-01T23:30:00');
    await markStaleWorkouts(db, NOW);
    expect(await statusOf(id)).toBe('in_progress');
  });

  it('closes every stale workout in one UPDATE', async () => {
    // Several in progress at once: data from before migration v9.
    await pg.exec('DROP INDEX one_in_progress_workout');
    const a = await seedLog('2025-05-28', '2025-05-28T09:00:00');
    const b = await seedLog('2025-05-29', '2025-05-29T09:00:00', {
      completed: 2,
    });
    const c = await seedLog('2025-05-30', '2025-05-30T09:00:00');
    events = [];
    await markStaleWorkouts(db, NOW);
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toEqual([{ table: 'workout_logs', op: 'update' }]);
    expect([await statusOf(a), await statusOf(b), await statusOf(c)]).toEqual([
      'missed',
      'incomplete',
      'missed',
    ]);
  });
});

describe('findResumable', () => {
  it('finds the in-progress workout after midnight', async () => {
    const id = await seedLog('2025-06-01', '2025-06-01T23:30:00');
    expect((await findResumable(db))?.id).toBe(id);
  });

  it('finds the in-progress workout even when ?date names another day', async () => {
    const id = await seedLog('2025-06-01', '2025-06-01T23:30:00');
    expect((await findResumable(db, { preferDate: '2025-05-20' }))?.id).toBe(
      id,
    );
  });
});

describe('startWorkout', () => {
  const opts = {
    programId: 1,
    sessionId: 1,
    date: '2025-06-02',
    startedAt: '2025-06-02T01:00:00',
  };

  it('a double tap creates one workout, not two', async () => {
    const [a, b] = await Promise.all([
      startWorkout(db, opts),
      startWorkout(db, opts),
    ]);
    expect(a.id).toBe(b.id);
    const n = await pg.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM workout_logs',
    );
    expect(n.rows[0].n).toBe(1);
    const sets = await pg.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM workout_sets',
    );
    expect(sets.rows[0].n).toBe(3);
  });

  it('returns the existing in-progress workout instead of starting another', async () => {
    const id = await seedLog('2025-06-01', '2025-06-01T23:30:00');
    expect((await startWorkout(db, opts)).id).toBe(id);
  });

  it('leaves nothing behind when instantiating the session fails', async () => {
    await pg.exec('DROP TABLE workout_sets');
    await expect(startWorkout(db, opts)).rejects.toThrow();
    const n = await pg.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM workout_logs',
    );
    expect(n.rows[0].n).toBe(0);
  });

  it('the schema allows only one in-progress workout', async () => {
    await seedLog('2025-06-01', '2025-06-01T23:30:00');
    await expect(seedLog('2025-06-02', '2025-06-02T00:30:00')).rejects.toThrow(
      /unique/i,
    );
  });
});
