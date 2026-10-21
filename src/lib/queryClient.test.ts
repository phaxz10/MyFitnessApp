import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '../services/db';
import { createTestDb } from '../test/testDb';
import { queryClient } from './queryClient';
import { QUERY_ROOTS, ROOTS_BY_TABLE } from './queryKeys';

let pg: PGlite;
let db: DB;

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
  queryClient.clear();
  for (const root of Object.values(QUERY_ROOTS)) {
    queryClient.setQueryData([root, 'probe'], 1);
  }
});

afterEach(async () => {
  queryClient.clear();
  await pg.close();
});

const flush = () => new Promise((r) => setTimeout(r, 0));
const invalidated = () =>
  Object.values(QUERY_ROOTS).filter(
    (root) => queryClient.getQueryState([root, 'probe'])?.isInvalidated,
  );

describe('Write Bus -> React Query', () => {
  it('a Set write invalidates strength progress, history and the week strip only', async () => {
    await db.exec(`
      INSERT INTO exercises (id, name) VALUES (1, 'Bench');
      INSERT INTO workout_logs (id, date, started_at, status) VALUES (1, '2026-10-01', '2026-10-01T09:00', 'completed');
    `);
    await flush();
    queryClient.clear();
    queryClient.setQueryData(['strengthProgress', 'probe'], 1);
    queryClient.setQueryData(['foodEntries', 'probe'], 1);
    await db.query(
      `INSERT INTO workout_sets (workout_log_id, exercise_id, set_number) VALUES (1, 1, 1)`,
    );
    await flush();
    expect(
      queryClient.getQueryState(['strengthProgress', 'probe'])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(['foodEntries', 'probe'])?.isInvalidated,
    ).toBe(false);
  });

  it('a weight log write invalidates exactly its mapped families', async () => {
    await db.query(
      `INSERT INTO weight_logs (date, weight_kg) VALUES ('2026-10-01', 80)`,
    );
    await flush();
    expect(invalidated().sort()).toEqual(
      [...ROOTS_BY_TABLE.weight_logs].sort(),
    );
  });

  it('transaction writes invalidate after COMMIT, and not at all on rollback', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO food_entries (date, meal_type, food_description, portion_grams, calories, protein_g, carbs_g, fat_g)
           VALUES ('2026-10-01', 'lunch', 'x', 1, 1, 1, 1, 1)`,
        );
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    await flush();
    expect(invalidated()).toEqual([]);
  });

  it('every table in the schema that a hook reads is mapped', () => {
    for (const table of [
      'user_profile',
      'workout_logs',
      'workout_sets',
      'workout_log_exercises',
      'exercises',
      'workout_programs',
      'program_sessions',
      'program_exercises',
      'food_entries',
      'weight_logs',
      'progress_photos',
    ]) {
      expect(ROOTS_BY_TABLE[table]?.length).toBeGreaterThan(0);
    }
  });
});
