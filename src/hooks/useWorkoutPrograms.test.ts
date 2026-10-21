import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runPendingMigrations } from '../services/migrator';
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
vi.mock('../services/db', () => ({ getDB: async () => pg }));

const { useWorkoutPrograms } = await import('./useWorkoutPrograms');

// Slot order mirrors the hook: programs, activeProgram, loading, error.
const activeProgram = () => slots[1] as WorkoutProgramWithSessions | null;

beforeEach(async () => {
  slot = 0;
  pg = new PGlite();
  await runPendingMigrations(pg);
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
