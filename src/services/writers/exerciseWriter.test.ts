import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../test/testDb';
import type { DB } from '../db';
import { exerciseUsage } from '../queries/exerciseUsage';
import { removeExercise } from './exerciseWriter';

let pg: PGlite;
let db: DB;

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
  await pg.exec(`
    INSERT INTO exercises (id, name) VALUES (1, 'Bench'), (2, 'Unused');
    INSERT INTO workout_programs (id, name, sessions_per_week) VALUES (1, 'P', 1);
    INSERT INTO program_sessions (id, program_id, name, order_index) VALUES (1, 1, 'Push', 0);
    INSERT INTO program_exercises (session_id, exercise_id, target_sets, order_index)
      VALUES (1, 1, 3, 0), (1, 2, 3, 1);
    INSERT INTO workout_logs (id, date, started_at, status)
      VALUES (1, '2025-06-01', '2025-06-01T09:00:00', 'completed');
    INSERT INTO workout_log_exercises (id, workout_log_id, exercise_id, order_index)
      VALUES (1, 1, 1, 0);
    INSERT INTO workout_sets (workout_log_id, exercise_id, workout_log_exercise_id, set_number, reps, weight_kg, completed_at)
      VALUES (1, 1, 1, 1, 5, 100, '2025-06-01T09:10:00');
    INSERT INTO exercise_notes (exercise_id, content) VALUES (1, 'elbows in');
  `);
});

afterEach(async () => {
  await pg.close();
});

const count = async (sql: string) =>
  (await pg.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${sql}`))
    .rows[0].n;

describe('removeExercise', () => {
  it('keeps the history of an exercise that was logged (archives it)', async () => {
    const outcome = await removeExercise(db, 1);

    expect(outcome).toBe('archived');
    expect(await count('workout_sets WHERE exercise_id = 1')).toBe(1);
    expect(await count('workout_log_exercises WHERE exercise_id = 1')).toBe(1);
    expect(await count('exercise_notes WHERE exercise_id = 1')).toBe(1);
    expect(
      await count('exercises WHERE id = 1 AND archived_at IS NOT NULL'),
    ).toBe(1);
  });

  it('takes an archived exercise out of programs', async () => {
    await removeExercise(db, 1);
    expect(await count('program_exercises WHERE exercise_id = 1')).toBe(0);
  });

  it('really deletes an exercise with no history', async () => {
    const outcome = await removeExercise(db, 2);

    expect(outcome).toBe('deleted');
    expect(await count('exercises WHERE id = 2')).toBe(0);
    expect(await count('program_exercises WHERE exercise_id = 2')).toBe(0);
  });

  it('the schema refuses a raw delete that would wipe history', async () => {
    await expect(
      pg.query('DELETE FROM exercises WHERE id = 1'),
    ).rejects.toThrow(/foreign key/);
  });
});

describe('exerciseUsage', () => {
  it('counts logged workouts and programs for the modal copy', async () => {
    expect(await exerciseUsage(db, 1)).toEqual({ workouts: 1, programs: 1 });
    expect(await exerciseUsage(db, 2)).toEqual({ workouts: 0, programs: 1 });
  });
});
