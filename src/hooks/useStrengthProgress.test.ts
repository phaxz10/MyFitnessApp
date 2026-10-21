import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runPendingMigrations } from '../services/migrator';

let pg: PGlite;
vi.mock('../services/db', () => ({ getDB: async () => pg }));

const { fetchExercisePRs, fetchExerciseSessionData } = await import(
  './useStrengthProgress'
);

beforeEach(async () => {
  pg = new PGlite();
  await runPendingMigrations(pg);
  await pg.exec(`
    INSERT INTO exercises (id, name) VALUES (1, 'Bench Press');
    INSERT INTO workout_logs (id, date, started_at, ended_at, status)
    VALUES (1, '2025-05-20', '2025-05-20T09:00:00', '2025-05-20T10:00:00', 'completed');
    INSERT INTO workout_sets (workout_log_id, exercise_id, set_number, reps, weight_kg)
    VALUES (1, 1, 1, 8, 60), (1, 1, 2, 6, 65), (1, 1, 3, NULL, 70);
  `);
});

afterEach(async () => {
  await pg.close();
});

describe('fetchExerciseSessionData', () => {
  // Regression: PGlite returns DATE as a Date object, and a Map keyed by
  // Date objects compares by identity, so every set became its own session.
  it('groups all sets from one workout day into one session', async () => {
    const sessions = await fetchExerciseSessionData(1, 'all');

    expect(sessions).toHaveLength(1);
    expect(sessions[0].date).toBe('2025-05-20');
    expect(sessions[0].totalSets).toBe(3);
    expect(sessions[0].sets.map((s) => s.weight)).toEqual([60, 65, 70]);
  });
});

describe('fetchExercisePRs', () => {
  it('reports null reps on a max-weight set logged without reps', async () => {
    const prs = await fetchExercisePRs(1);
    expect(prs.maxWeight).toEqual({
      value: 70,
      reps: null,
      date: '2025-05-20',
    });
  });
});
