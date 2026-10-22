import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MUSCLE_GROUPS } from '../components/exercise-library/constants';
import { createTestDb } from '../test/testDb';
import { seedStarterLibraryIfEmpty } from './starterLibrary';

// A fresh install with no AI key had no way to get exercises except typing
// each one in, so "Add Exercise" mid-session showed nothing to pick.

let pg: PGlite;
let db: Awaited<ReturnType<typeof createTestDb>>['db'];

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
});
afterEach(async () => {
  await pg.close();
});

async function count() {
  const r = await pg.query<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM exercises',
  );
  return r.rows[0].n;
}

describe('seedStarterLibraryIfEmpty', () => {
  it('fills an empty library with home-gym exercises', async () => {
    await seedStarterLibraryIfEmpty(db);
    expect(await count()).toBeGreaterThanOrEqual(25);
    const r = await pg.query<{ name: string }>(
      "SELECT name FROM exercises WHERE name = 'Goblet Squat'",
    );
    expect(r.rows).toHaveLength(1);
  });

  it('files every starter under a library filter chip', async () => {
    await seedStarterLibraryIfEmpty(db);
    const r = await pg.query<{ muscle_groups: string }>(
      'SELECT muscle_groups FROM exercises',
    );
    for (const { muscle_groups } of r.rows) {
      expect(MUSCLE_GROUPS).toContain(muscle_groups.split(',')[0].trim());
    }
  });

  it('leaves an existing library alone and is idempotent', async () => {
    await pg.query("INSERT INTO exercises (name) VALUES ('My Own Lift')");
    await seedStarterLibraryIfEmpty(db);
    expect(await count()).toBe(1);
  });
});
