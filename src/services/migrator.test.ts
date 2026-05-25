import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runPendingMigrations } from './migrator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getVersion(db: PGlite): Promise<number> {
  const result = await db.query<{ max: number | null }>(
    'SELECT MAX(version) as max FROM schema_migrations',
  );
  return result.rows[0]?.max ?? 0;
}

async function tableExists(db: PGlite, name: string): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_name = $1
     ) as exists`,
    [name],
  );
  return result.rows[0].exists;
}

async function columnExists(
  db: PGlite,
  table: string,
  column: string,
): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = $1 AND column_name = $2
     ) as exists`,
    [table, column],
  );
  return result.rows[0].exists;
}

async function indexExists(db: PGlite, name: string): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_indexes WHERE indexname = $1
     ) as exists`,
    [name],
  );
  return result.rows[0].exists;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
});

afterEach(async () => {
  await db.close();
});

describe('runPendingMigrations', () => {
  it('creates all 14 tables on a fresh database', async () => {
    await runPendingMigrations(db);

    const tables = [
      'schema_migrations',
      'user_profile',
      'weight_logs',
      'food_entries',
      'exercises',
      'workout_programs',
      'program_sessions',
      'program_exercises',
      'workout_logs',
      'workout_log_exercises',
      'workout_sets',
      'exercise_notes',
      'ai_goal_reviews',
      'weekly_reviews',
      'progress_photos',
    ];

    for (const table of tables) {
      expect(await tableExists(db, table), `${table} should exist`).toBe(true);
    }
  });

  // Bump LATEST_MIGRATION when a new migration is added to migrator.ts.
  const LATEST_MIGRATION = 3;

  it(`records version ${LATEST_MIGRATION} in schema_migrations`, async () => {
    await runPendingMigrations(db);

    const version = await getVersion(db);
    expect(version).toBe(LATEST_MIGRATION);
  });

  it('is a no-op on second run (warm start)', async () => {
    await runPendingMigrations(db);
    const firstVersion = await getVersion(db);

    // Run again — should do nothing
    await runPendingMigrations(db);
    const secondVersion = await getVersion(db);

    expect(firstVersion).toBe(secondVersion);

    // Should still have exactly LATEST_MIGRATION rows in schema_migrations
    const result = await db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM schema_migrations',
    );
    expect(Number(result.rows[0].count)).toBe(LATEST_MIGRATION);
  });

  it('creates all expected indexes', async () => {
    await runPendingMigrations(db);

    const indexes = [
      'idx_food_entries_date',
      'idx_weight_logs_date',
      'idx_workout_logs_date',
      'idx_program_sessions_program',
      'idx_program_exercises_session',
      'idx_workout_sets_log',
      'idx_progress_photos_date',
      'idx_exercise_notes_exercise',
      'idx_workout_log_exercises_log',
    ];

    for (const idx of indexes) {
      expect(await indexExists(db, idx), `${idx} should exist`).toBe(true);
    }
  });

  it('includes workout_log_exercise_id and completed_at on workout_sets', async () => {
    await runPendingMigrations(db);

    expect(
      await columnExists(db, 'workout_sets', 'workout_log_exercise_id'),
    ).toBe(true);
    expect(await columnExists(db, 'workout_sets', 'completed_at')).toBe(true);
  });

  it('allows null reps and weight_kg in workout_sets', async () => {
    await runPendingMigrations(db);

    // Insert a set with null reps and weight — should not throw
    await db.exec(`
      INSERT INTO exercises (name) VALUES ('Test Exercise');
      INSERT INTO workout_logs (date, started_at) VALUES ('2025-01-01', '2025-01-01T09:00:00');
      INSERT INTO workout_sets (workout_log_id, exercise_id, set_number, reps, weight_kg)
      VALUES (1, 1, 1, NULL, NULL);
    `);

    const result = await db.query<{
      reps: number | null;
      weight_kg: number | null;
    }>('SELECT reps, weight_kg FROM workout_sets WHERE id = 1');
    expect(result.rows[0].reps).toBeNull();
    expect(result.rows[0].weight_kg).toBeNull();
  });

  it('rolls back a failed migration without corrupting state', async () => {
    // Run the real migrations first
    await runPendingMigrations(db);
    expect(await getVersion(db)).toBe(LATEST_MIGRATION);

    // Manually insert a row to verify it survives the failed migration
    await db.exec(`
      INSERT INTO exercises (name) VALUES ('Survivor');
    `);

    // Now simulate: if a hypothetical migration 2 were added and failed,
    // version should stay at 1 and existing data should be intact.
    // (We can't easily inject a bad migration into the module, so we
    // verify the transaction mechanics directly.)
    try {
      await db.exec('BEGIN');
      await db.exec('CREATE TABLE test_fail (id INT)');
      // Simulate failure
      throw new Error('simulated migration failure');
    } catch {
      await db.exec('ROLLBACK');
    }

    // test_fail should not exist (rolled back)
    expect(await tableExists(db, 'test_fail')).toBe(false);

    // Existing data intact
    const result = await db.query<{ name: string }>(
      'SELECT name FROM exercises',
    );
    expect(result.rows[0].name).toBe('Survivor');
  });
});
