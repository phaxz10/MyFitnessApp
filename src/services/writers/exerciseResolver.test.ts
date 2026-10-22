import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../../test/testDb';
import type { AIExerciseResponse, Exercise } from '../../types';
import type { DB } from '../db';
import { resolveExercises } from './exerciseResolver';

let pg: PGlite;
let db: DB;

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
  await pg.exec(`
    INSERT INTO exercises (id, name, muscle_groups) VALUES (1, 'Bench Press', 'Chest'), (2, 'Old Row', 'Back');
    UPDATE exercises SET archived_at = CURRENT_TIMESTAMP WHERE id = 2;
    SELECT setval('exercises_id_seq', 100);
  `);
});

afterEach(async () => {
  await pg.close();
});

const library = async () =>
  (await pg.query<Exercise>('SELECT * FROM exercises ORDER BY id')).rows;

const details = (name: string): AIExerciseResponse => ({
  name,
  description: `${name} description`,
  muscle_groups: ['Back', 'Biceps'],
  equipment: 'Dumbbell',
  tips: [],
  exercise_type: 'reps_weight',
});

const failingFetch = () =>
  vi.fn(async () => {
    throw new Error('offline');
  });

describe('resolveExercises', () => {
  it('matches library names ignoring case and whitespace', async () => {
    const fetch = failingFetch();
    const map = await resolveExercises(
      db,
      [{ name: '  bench   PRESS ' }],
      await library(),
      fetch,
    );
    expect(map.get('bench press')?.id).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(await library()).toHaveLength(2);
  });

  it('creates missing exercises with fetched details', async () => {
    const fetch = vi.fn(async (names: string[]) => names.map(details));
    const map = await resolveExercises(
      db,
      [{ name: 'Dumbbell Row' }],
      await library(),
      fetch,
    );
    const created = map.get('dumbbell row');
    expect(created).toMatchObject({
      name: 'Dumbbell Row',
      muscle_groups: 'Back, Biceps',
      equipment: 'Dumbbell',
      is_ai_generated: true,
    });
    expect(fetch).toHaveBeenCalledWith(['Dumbbell Row']);
  });

  it('uses provided details without fetching', async () => {
    const map = await resolveExercises(
      db,
      [{ name: 'Goblet Squat', details: details('Goblet Squat') }],
      await library(),
      failingFetch(),
    );
    expect(map.get('goblet squat')?.description).toBe(
      'Goblet Squat description',
    );
  });

  it('creates a repeated name only once', async () => {
    const fetch = vi.fn(async (names: string[]) => names.map(details));
    const map = await resolveExercises(
      db,
      [{ name: 'Face Pull' }, { name: 'face pull' }, { name: 'Face  Pull' }],
      await library(),
      fetch,
    );
    expect(fetch).toHaveBeenCalledWith(['Face Pull']);
    expect(map.size).toBe(1);
    const rows = await pg.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM exercises WHERE lower(name) = 'face pull'`,
    );
    expect(rows.rows[0].n).toBe(1);
  });

  it('does not match an archived exercise', async () => {
    const map = await resolveExercises(
      db,
      [{ name: 'Old Row' }],
      await library(),
      async () => [],
    );
    const row = map.get('old row');
    expect(row?.id).not.toBe(2);
    expect(row?.archived_at).toBeNull();
  });

  it('creates a minimal row when the details fetch fails', async () => {
    const map = await resolveExercises(
      db,
      [{ name: 'Cossack Squat' }],
      await library(),
      failingFetch(),
    );
    expect(map.get('cossack squat')).toMatchObject({
      name: 'Cossack Squat',
      exercise_type: 'reps_weight',
      muscle_groups: null,
      is_ai_generated: true,
    });
  });
});
