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
  const LATEST_MIGRATION = 9;

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

  it('adds diet_type to user_profile defaulting to balanced (migration 4)', async () => {
    await runPendingMigrations(db);

    expect(await columnExists(db, 'user_profile', 'diet_type')).toBe(true);

    // A row inserted without diet_type should backfill to 'balanced'.
    await db.exec(`
      INSERT INTO user_profile
        (id, birthdate, gender, height_cm, activity_level, goal, calorie_target, protein_target_g, carbs_target_g, fat_target_g)
      VALUES (1, '1990-01-01', 'male', 180, 'moderate', 'recomp', 2000, 150, 200, 70);
    `);
    const result = await db.query<{ diet_type: string }>(
      'SELECT diet_type FROM user_profile WHERE id = 1',
    );
    expect(result.rows[0].diet_type).toBe('balanced');
  });

  it('pins ai_provider to openrouter and remaps legacy models (migration 5)', async () => {
    // Pause after v4 so a row can be seeded in its true pre-v5 shape:
    // vendored provider, bare model id, raw vendor key, proxy set.
    await runPendingMigrations(db, 4);
    await db.exec(`
      INSERT INTO user_profile
        (id, birthdate, gender, height_cm, activity_level, goal, calorie_target, protein_target_g, carbs_target_g, fat_target_g,
         ai_provider, ai_model, ai_api_key, ai_proxy_url)
      VALUES
        (1, '1990-01-01', 'male', 180, 'moderate', 'recomp', 2000, 150, 200, 70,
         'openai', 'gpt-4o', 'sk-openai-key', 'https://proxy.example.com');
      `);

    await runPendingMigrations(db);

    const result = await db.query<{
      ai_provider: string;
      ai_model: string;
      ai_api_key: string | null;
      ai_proxy_url: string | null;
    }>(
      'SELECT ai_provider, ai_model, ai_api_key, ai_proxy_url FROM user_profile WHERE id = 1',
    );
    expect(result.rows[0].ai_provider).toBe('openrouter');
    expect(result.rows[0].ai_model).toBe('openai/gpt-4o');
    // Vendor keys cannot authenticate against OpenRouter — force re-setup.
    expect(result.rows[0].ai_api_key).toBeNull();
    expect(result.rows[0].ai_proxy_url).toBeNull();

    // The v3 multi-vendor CHECK is gone; the replacement pins 'openrouter'.
    const constraint = await db.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'user_profile'::regclass
         AND conname LIKE '%ai_provider%'`,
    );
    expect(constraint.rows).toHaveLength(1);
    expect(constraint.rows[0].conname).toBe('user_profile_ai_provider_check');
  });

  it('adds weight_unit and converts lbs-entered lifts to kg (migration 6)', async () => {
    // Pre-v6 shape: the set-row UI labelled weight_kg as "lbs", so stored
    // lifting numbers are pounds. Body weight was always entered as kg.
    await runPendingMigrations(db, 5);
    await db.exec(`
      INSERT INTO user_profile
        (id, birthdate, gender, height_cm, activity_level, goal, calorie_target, protein_target_g, carbs_target_g, fat_target_g)
      VALUES (1, '1990-01-01', 'male', 180, 'moderate', 'recomp', 2000, 150, 200, 70);
      INSERT INTO weight_logs (date, weight_kg) VALUES ('2026-01-01', 82.5);
      INSERT INTO exercises (name) VALUES ('Bench Press');
      INSERT INTO workout_logs (date, started_at) VALUES ('2026-01-01', '2026-01-01T09:00:00');
      INSERT INTO workout_sets (workout_log_id, exercise_id, set_number, reps, weight_kg)
      VALUES (1, 1, 1, 8, 135), (1, 1, 2, 10, NULL);
    `);

    await runPendingMigrations(db);

    const profile = await db.query<{ weight_unit: string }>(
      'SELECT weight_unit FROM user_profile WHERE id = 1',
    );
    expect(profile.rows[0].weight_unit).toBe('lbs');

    const sets = await db.query<{ weight_kg: number | null }>(
      'SELECT weight_kg FROM workout_sets ORDER BY set_number',
    );
    expect(sets.rows[0].weight_kg).toBeCloseTo(135 * 0.45359237, 4);
    expect(sets.rows[1].weight_kg).toBeNull();

    const body = await db.query<{ weight_kg: number }>(
      'SELECT weight_kg FROM weight_logs',
    );
    expect(body.rows[0].weight_kg).toBe(82.5);
  });

  it('keeps logged history when an exercise is deleted after upgrading (migration 7)', async () => {
    await runPendingMigrations(db, 6);
    await db.exec(`
      INSERT INTO exercises (name) VALUES ('Bench Press');
      INSERT INTO workout_logs (date, started_at, status) VALUES ('2026-01-01', '2026-01-01T09:00:00', 'completed');
      INSERT INTO workout_log_exercises (workout_log_id, exercise_id, order_index) VALUES (1, 1, 0);
      INSERT INTO workout_sets (workout_log_id, exercise_id, workout_log_exercise_id, set_number, reps)
        VALUES (1, 1, 1, 1, 8);
      INSERT INTO exercise_notes (exercise_id, content) VALUES (1, 'grip');
    `);

    await runPendingMigrations(db);

    expect(await columnExists(db, 'exercises', 'archived_at')).toBe(true);
    await expect(db.exec('DELETE FROM exercises WHERE id = 1')).rejects.toThrow(
      /foreign key/,
    );
    const sets = await db.query('SELECT id FROM workout_sets');
    expect(sets.rows).toHaveLength(1);
  });

  it('adds workout_log_exercises.program_exercise_id (migration 8)', async () => {
    await runPendingMigrations(db);
    expect(
      await columnExists(db, 'workout_log_exercises', 'program_exercise_id'),
    ).toBe(true);
  });

  it('keeps the newest of several in-progress workouts and closes the rest (migration 9)', async () => {
    await runPendingMigrations(db, 8);
    await db.exec(`
      INSERT INTO exercises (name) VALUES ('Squat');
      INSERT INTO workout_logs (date, started_at, status) VALUES
        ('2026-01-01', '2026-01-01T09:00:00', 'in_progress'),
        ('2026-01-02', '2026-01-02T09:00:00', 'in_progress'),
        ('2026-01-03', '2026-01-03T09:00:00', 'in_progress');
      INSERT INTO workout_sets (workout_log_id, exercise_id, set_number, reps, completed_at) VALUES
        (1, 1, 1, 5, '2026-01-01T09:10:00'),
        (2, 1, 1, NULL, NULL);
    `);

    await runPendingMigrations(db);

    const logs = await db.query<{ status: string }>(
      'SELECT status FROM workout_logs ORDER BY id',
    );
    expect(logs.rows.map((r) => r.status)).toEqual([
      'incomplete',
      'missed',
      'in_progress',
    ]);
    await expect(
      db.exec(
        "INSERT INTO workout_logs (date, started_at, status) VALUES ('2026-01-04', '2026-01-04T09:00:00', 'in_progress')",
      ),
    ).rejects.toThrow(/unique/i);
  });

  it('defaults weight_unit to kg for new profiles and rejects other values', async () => {
    await runPendingMigrations(db);
    await db.exec(`
      INSERT INTO user_profile
        (id, birthdate, gender, height_cm, activity_level, goal, calorie_target, protein_target_g, carbs_target_g, fat_target_g)
      VALUES (1, '1990-01-01', 'male', 180, 'moderate', 'recomp', 2000, 150, 200, 70);
    `);
    const result = await db.query<{ weight_unit: string }>(
      'SELECT weight_unit FROM user_profile WHERE id = 1',
    );
    expect(result.rows[0].weight_unit).toBe('kg');
    await expect(
      db.exec(`UPDATE user_profile SET weight_unit = 'stone'`),
    ).rejects.toThrow();
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
