import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DB } from '../services/db';
import { instantiateSession } from '../services/writers/workoutWriter';
import { createTestDb } from '../test/testDb';
import type { WorkoutProgramWithSessions } from '../types';

// No DOM harness in this repo (node env), so React is stubbed: useState keeps
// the latest value per call slot, useCallback is identity. That is enough to
// check what the hook publishes after an action.
const slots: unknown[] = [];
let slot = 0;
vi.mock('react', () => ({
  useCallback: <T>(fn: T) => fn,
  useState: (init: unknown) => {
    const i = slot++;
    slots[i] = init;
    return [init, (v: unknown) => (slots[i] = v)];
  },
}));

let pg: PGlite;
let db: DB;
vi.mock('../services/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/db')>()),
  getDB: async () => db,
}));

const { useWorkoutPrograms } = await import('./useWorkoutPrograms');

// Slot order mirrors the hook: programs, activeProgram, loading, error.
const activeProgram = () => slots[1] as WorkoutProgramWithSessions | null;

beforeEach(async () => {
  slot = 0;
  ({ pg, db } = await createTestDb());
  await pg.exec(`
    INSERT INTO workout_programs (name, sessions_per_week, is_active)
    VALUES ('PPL', 3, true), ('Upper Lower', 4, false);
    INSERT INTO program_sessions (program_id, name, day_of_week, order_index)
    VALUES (2, 'Upper', 1, 0);
  `);
});

afterEach(async () => {
  await pg.close();
});

describe('useWorkoutPrograms.setActiveProgramById', () => {
  // Bug D: the Training tab kept "No Active Program" after Set Active.
  it('publishes the newly active program without a reload', async () => {
    const hook = useWorkoutPrograms();
    await hook.setActiveProgramById(2);

    expect(activeProgram()?.id).toBe(2);
    expect(activeProgram()?.sessions.map((s) => s.name)).toEqual(['Upper']);
  });

  it('activates from a state with no active program', async () => {
    await pg.exec('UPDATE workout_programs SET is_active = false');
    const hook = useWorkoutPrograms();
    expect(await hook.fetchActiveProgram()).toBeNull();

    await hook.setActiveProgramById(1);
    expect(activeProgram()?.id).toBe(1);
  });
});

describe('useWorkoutPrograms.syncSessionToProgram', () => {
  // Bug: rows were matched by exercise_id, so an exercise listed twice in a
  // Session (e.g. heavy and back-off Bench) collapsed onto one program row.
  it('syncs each copy of a repeated exercise to its own program row', async () => {
    await pg.exec(`
      INSERT INTO exercises (id, name) VALUES (1, 'Bench'), (2, 'Fly');
      INSERT INTO program_sessions (id, program_id, name, order_index) VALUES (10, 1, 'Push', 0);
      INSERT INTO program_exercises (id, session_id, exercise_id, target_sets, target_rep_min, order_index)
        VALUES (100, 10, 1, 3, 3, 0), (101, 10, 2, 3, 10, 1), (102, 10, 1, 5, 8, 2);
      INSERT INTO workout_logs (id, program_id, session_id, date, started_at, status)
        VALUES (1, 1, 10, '2025-06-01', '2025-06-01T09:00:00', 'in_progress');
    `);
    await instantiateSession(db, 1, 10);
    const wles = (
      await pg.query<{ id: number; exercise_id: number; order_index: number }>(
        `SELECT wle.*, e.name AS exercise_name, e.exercise_type
         FROM workout_log_exercises wle JOIN exercises e ON e.id = wle.exercise_id
         WHERE workout_log_id = 1 ORDER BY order_index`,
      )
    ).rows;
    // Performed: heavy Bench 4 sets, Fly 3, back-off Bench 2.
    const counts = new Map([
      [wles[0].id, 4],
      [wles[1].id, 3],
      [wles[2].id, 2],
    ]);

    const hook = useWorkoutPrograms();
    await hook.syncSessionToProgram(10, wles as never, counts);

    const rows = (
      await pg.query<{ id: number; exercise_id: number; target_sets: number }>(
        'SELECT id, exercise_id, target_sets FROM program_exercises WHERE session_id = 10 ORDER BY order_index',
      )
    ).rows;
    expect(rows).toEqual([
      { id: 100, exercise_id: 1, target_sets: 4 },
      { id: 101, exercise_id: 2, target_sets: 3 },
      { id: 102, exercise_id: 1, target_sets: 2 },
    ]);
  });

  it('keeps matching by exercise for workouts logged before the link existed', async () => {
    await pg.exec(`
      INSERT INTO exercises (id, name) VALUES (1, 'Bench');
      INSERT INTO program_sessions (id, program_id, name, order_index) VALUES (10, 1, 'Push', 0);
      INSERT INTO program_exercises (id, session_id, exercise_id, target_sets, order_index)
        VALUES (100, 10, 1, 3, 0);
      INSERT INTO workout_logs (id, program_id, session_id, date, started_at, status)
        VALUES (1, 1, 10, '2025-06-01', '2025-06-01T09:00:00', 'in_progress');
      INSERT INTO workout_log_exercises (id, workout_log_id, exercise_id, order_index, target_sets)
        VALUES (50, 1, 1, 0, 3);
    `);
    const wles = (
      await pg.query(
        'SELECT wle.*, e.name AS exercise_name FROM workout_log_exercises wle JOIN exercises e ON e.id = wle.exercise_id',
      )
    ).rows;

    const hook = useWorkoutPrograms();
    await hook.syncSessionToProgram(10, wles as never, new Map([[50, 5]]));

    const rows = (
      await pg.query<{ id: number; target_sets: number }>(
        'SELECT id, target_sets FROM program_exercises WHERE session_id = 10',
      )
    ).rows;
    expect(rows).toEqual([{ id: 100, target_sets: 5 }]);
  });
});
