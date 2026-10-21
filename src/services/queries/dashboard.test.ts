import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../test/testDb';
import type { DB } from '../db';
import {
  activeProgram,
  resumableWorkout,
  sessionStatusForDate,
} from './dashboard';

let pg: PGlite;
let db: DB;

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
  await pg.exec(`
    INSERT INTO exercises (id, name) VALUES (1, 'Bench'), (2, 'Row'), (3, 'Squat');
    INSERT INTO workout_programs (id, name, sessions_per_week, is_active) VALUES (1, 'Old', 3, false), (2, 'PPL', 3, true);
    INSERT INTO program_sessions (id, program_id, name, day_of_week, order_index)
      VALUES (10, 2, 'Pull', 2, 1), (11, 2, 'Push', 1, 0), (12, 2, 'Rest', NULL, 2), (13, 1, 'Other', 1, 0);
    INSERT INTO program_exercises (id, session_id, exercise_id, target_sets, target_rep_min, target_rep_max, order_index)
      VALUES (100, 11, 3, 3, 8, 12, 1), (101, 11, 1, 3, 8, 12, 0), (102, 10, 2, 3, 8, 12, 0), (103, 13, 1, 3, 8, 12, 0);
  `);
});

afterEach(async () => {
  await pg.close();
});

describe('activeProgram', () => {
  it('nests each Session its own Program Exercises in order (one query for all Sessions)', async () => {
    const program = await activeProgram(db);
    expect(program?.id).toBe(2);
    expect(program?.sessions.map((s) => s.id)).toEqual([11, 10, 12]);
    expect(program?.sessions.map((s) => s.exercises.map((e) => e.id))).toEqual([
      [101, 100],
      [102],
      [],
    ]);
    expect(program?.sessions[0].exercises[0].exercise_name).toBe('Bench');
  });

  it('is null without an active Program', async () => {
    await pg.exec('UPDATE workout_programs SET is_active = false');
    expect(await activeProgram(db)).toBeNull();
  });
});

describe('sessionStatusForDate / resumableWorkout', () => {
  it('reports the latest log of the Session on that date', async () => {
    expect(await sessionStatusForDate(db, 11, '2026-10-01')).toEqual({
      hasWorkout: false,
      status: null,
      workoutId: null,
    });
    await pg.exec(`
      INSERT INTO workout_logs (id, session_id, date, started_at, ended_at, status)
        VALUES (1, 11, '2026-10-01', '2026-10-01T08:00', '2026-10-01T09:00', 'completed'),
               (2, 11, '2026-10-01', '2026-10-01T18:00', NULL, 'incomplete');
    `);
    expect(await sessionStatusForDate(db, 11, '2026-10-01')).toEqual({
      hasWorkout: true,
      status: 'incomplete',
      workoutId: 2,
    });
  });

  it('returns the in-progress Workout Log to resume', async () => {
    expect(await resumableWorkout(db)).toBeNull();
    await pg.exec(
      `INSERT INTO workout_logs (id, date, started_at, status) VALUES (5, '2026-10-02', '2026-10-02T08:00', 'in_progress')`,
    );
    expect((await resumableWorkout(db))?.id).toBe(5);
  });
});
