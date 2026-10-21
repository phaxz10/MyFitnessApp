import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runPendingMigrations } from '../services/migrator';

// No DOM harness (node env): stub React so the hook runs as plain functions,
// and seed its state with a generated program ready to save.
const seededState = {
  step: 'complete',
  progress: '',
  generatedProgram: {
    programName: 'AI Push Pull',
    programDescription: 'Generated',
    sessions: [],
  },
  exerciseMappings: [],
  error: null,
  inferredExperience: null,
  isOnlyProgram: false,
  streamlinedResult: null,
};
vi.mock('react', () => ({
  useCallback: <T>(fn: T) => fn,
  useState: () => [seededState, () => {}],
}));

let pg: PGlite;
vi.mock('../services/db', () => ({ getDB: async () => pg }));

const { useProgramGenerator } = await import('./useProgramGenerator');

async function programs() {
  const result = await pg.query<{ id: number; is_active: boolean }>(
    'SELECT id, is_active FROM workout_programs ORDER BY id',
  );
  return result.rows;
}

beforeEach(async () => {
  pg = new PGlite();
  await runPendingMigrations(pg);
  await pg.exec(
    `INSERT INTO workout_programs (name, sessions_per_week, is_active) VALUES ('Old', 3, true)`,
  );
});

afterEach(async () => {
  await pg.close();
});

describe('useProgramGenerator.activateProgram', () => {
  // Regression: the wizard's "Set as Active" re-ran the save, creating a
  // duplicate program and activating the copy instead of the saved one.
  it('activates the saved program without saving it again', async () => {
    const hook = useProgramGenerator();
    const { programId, wasAutoActivated } =
      await hook.saveProgramWithAutoActivation();
    expect(wasAutoActivated).toBe(false);
    expect(programId).not.toBeNull();

    await hook.activateProgram(programId!);

    expect(await programs()).toEqual([
      { id: 1, is_active: false },
      { id: programId, is_active: true },
    ]);
  });
});
