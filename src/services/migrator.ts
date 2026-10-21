import type { PGlite } from '@electric-sql/pglite';

// ---------------------------------------------------------------------------
// Migration registry
//
// Each entry runs exactly once, inside its own transaction. To add a new
// migration, append to the array with the next sequential version number.
// ---------------------------------------------------------------------------

interface Migration {
  version: number;
  up: (db: PGlite) => Promise<void>;
}

const migrations: Migration[] = [
  {
    // Full schema — all tables, columns, and indexes as of launch.
    version: 1,
    up: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS user_profile (
          id INTEGER PRIMARY KEY DEFAULT 1,
          birthdate DATE NOT NULL,
          gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
          height_cm REAL NOT NULL,
          activity_level TEXT NOT NULL CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active')),
          goal TEXT NOT NULL CHECK (goal IN ('bulk', 'lean_bulk', 'recomp', 'cut', 'maintain')),
          calorie_target INTEGER NOT NULL,
          protein_target_g INTEGER NOT NULL,
          carbs_target_g INTEGER NOT NULL,
          fat_target_g INTEGER NOT NULL,
          openai_api_key TEXT,
          openai_proxy_url TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS weight_logs (
          id SERIAL PRIMARY KEY,
          date DATE NOT NULL UNIQUE,
          weight_kg REAL NOT NULL,
          waist_cm REAL,
          neck_cm REAL,
          arm_cm REAL,
          body_fat_pct REAL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS food_entries (
          id SERIAL PRIMARY KEY,
          date DATE NOT NULL,
          meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
          food_description TEXT NOT NULL,
          portion_grams REAL NOT NULL,
          calories INTEGER NOT NULL,
          protein_g REAL NOT NULL,
          carbs_g REAL NOT NULL,
          fat_g REAL NOT NULL,
          is_ai_generated BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS exercises (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          muscle_groups TEXT,
          equipment TEXT,
          video_url TEXT,
          exercise_type TEXT NOT NULL DEFAULT 'reps_weight'
            CHECK (exercise_type IN ('reps_weight', 'reps_only', 'duration', 'duration_weight')),
          is_ai_generated BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS workout_programs (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          sessions_per_week INTEGER NOT NULL,
          is_active BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS program_sessions (
          id SERIAL PRIMARY KEY,
          program_id INTEGER NOT NULL REFERENCES workout_programs(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          day_of_week INTEGER,
          order_index INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS program_exercises (
          id SERIAL PRIMARY KEY,
          session_id INTEGER NOT NULL REFERENCES program_sessions(id) ON DELETE CASCADE,
          exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
          target_sets INTEGER NOT NULL,
          target_rep_min INTEGER,
          target_rep_max INTEGER,
          target_duration_seconds INTEGER,
          order_index INTEGER NOT NULL,
          superset_group_id TEXT,
          notes TEXT
        );

        CREATE TABLE IF NOT EXISTS workout_logs (
          id SERIAL PRIMARY KEY,
          program_id INTEGER REFERENCES workout_programs(id) ON DELETE SET NULL,
          session_id INTEGER REFERENCES program_sessions(id) ON DELETE SET NULL,
          date DATE NOT NULL,
          started_at TIMESTAMP NOT NULL,
          ended_at TIMESTAMP,
          status TEXT NOT NULL DEFAULT 'in_progress'
            CHECK (status IN ('in_progress', 'completed', 'incomplete', 'missed')),
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS workout_log_exercises (
          id SERIAL PRIMARY KEY,
          workout_log_id INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
          exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
          order_index INTEGER NOT NULL,
          superset_group_id TEXT,
          target_sets INTEGER,
          target_rep_min INTEGER,
          target_rep_max INTEGER,
          target_duration_seconds INTEGER,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS workout_sets (
          id SERIAL PRIMARY KEY,
          workout_log_id INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
          exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
          workout_log_exercise_id INTEGER REFERENCES workout_log_exercises(id) ON DELETE CASCADE,
          set_number INTEGER NOT NULL,
          reps INTEGER,
          weight_kg REAL,
          duration_seconds INTEGER,
          notes TEXT,
          completed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS exercise_notes (
          id SERIAL PRIMARY KEY,
          exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ai_goal_reviews (
          id SERIAL PRIMARY KEY,
          review_date DATE NOT NULL,
          previous_calorie_target INTEGER NOT NULL,
          new_calorie_target INTEGER NOT NULL,
          previous_goal TEXT NOT NULL,
          new_goal_suggestion TEXT,
          ai_analysis TEXT NOT NULL,
          was_accepted BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS weekly_reviews (
          id SERIAL PRIMARY KEY,
          week_start DATE NOT NULL,
          week_end DATE NOT NULL,
          start_weight REAL,
          end_weight REAL,
          weight_change REAL,
          avg_daily_calories INTEGER,
          calorie_target INTEGER NOT NULL,
          calorie_adherence INTEGER,
          workouts_completed INTEGER DEFAULT 0,
          previous_goal TEXT NOT NULL,
          new_goal TEXT,
          previous_calorie_target INTEGER NOT NULL,
          new_calorie_target INTEGER,
          ai_summary TEXT NOT NULL,
          recommendations_applied TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(week_start, week_end)
        );

        CREATE TABLE IF NOT EXISTS progress_photos (
          id SERIAL PRIMARY KEY,
          date DATE NOT NULL,
          photo_data TEXT NOT NULL,
          photo_type TEXT DEFAULT 'front',
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_food_entries_date ON food_entries(date);
        CREATE INDEX IF NOT EXISTS idx_weight_logs_date ON weight_logs(date);
        CREATE INDEX IF NOT EXISTS idx_workout_logs_date ON workout_logs(date);
        CREATE INDEX IF NOT EXISTS idx_program_sessions_program ON program_sessions(program_id);
        CREATE INDEX IF NOT EXISTS idx_program_exercises_session ON program_exercises(session_id);
        CREATE INDEX IF NOT EXISTS idx_workout_sets_log ON workout_sets(workout_log_id);
        CREATE INDEX IF NOT EXISTS idx_progress_photos_date ON progress_photos(date);
        CREATE INDEX IF NOT EXISTS idx_exercise_notes_exercise ON exercise_notes(exercise_id);
        CREATE INDEX IF NOT EXISTS idx_workout_log_exercises_log ON workout_log_exercises(workout_log_id);
        CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise ON workout_sets(exercise_id);
        CREATE INDEX IF NOT EXISTS idx_workout_sets_wle ON workout_sets(workout_log_exercise_id);
        CREATE INDEX IF NOT EXISTS idx_workout_logs_completed ON workout_logs(status) WHERE status = 'completed';
        CREATE INDEX IF NOT EXISTS idx_workout_sets_completed_at ON workout_sets(completed_at);
      `);
    },
  },
  {
    // Allow NULL photo_data: a restored backup row may carry no image.
    version: 2,
    up: async (db) => {
      await db.exec(
        `ALTER TABLE progress_photos ALTER COLUMN photo_data DROP NOT NULL`,
      );
    },
  },
  {
    // Multi-provider AI: rename openai_* columns to ai_* and add provider/model
    // selectors. Existing rows backfill to ('openai', 'gpt-4o') so users see
    // no behaviour change. See ADR-0005.
    version: 3,
    up: async (db) => {
      await db.exec(`
        ALTER TABLE user_profile RENAME COLUMN openai_api_key TO ai_api_key;
        ALTER TABLE user_profile RENAME COLUMN openai_proxy_url TO ai_proxy_url;
        ALTER TABLE user_profile ADD COLUMN ai_provider TEXT NOT NULL DEFAULT 'openai'
          CHECK (ai_provider IN ('openai', 'anthropic', 'google'));
        ALTER TABLE user_profile ADD COLUMN ai_model TEXT NOT NULL DEFAULT 'gpt-4o';
      `);
    },
  },
  {
    // Carb strategy: add diet_type to drive the macro split. Existing rows
    // backfill to 'balanced' (carbs absorb remaining calories) so users see no
    // change in their targets. 'low_carb'/'keto' pin carbs and let fat fill the
    // rest. See ADR-0006.
    version: 4,
    up: async (db) => {
      await db.exec(`
        ALTER TABLE user_profile ADD COLUMN diet_type TEXT NOT NULL DEFAULT 'balanced'
          CHECK (diet_type IN ('balanced', 'moderate', 'low_carb', 'keto'));
      `);
    },
  },
  {
    // OpenRouter becomes the single AI provider (ADR-0007). Legacy rows kept
    // ('openai' | 'anthropic' | 'google') from migration v3's CHECK constraint;
    // that constraint must be dropped before the provider value can change.
    //
    // Model ids get remapped to OpenRouter slugs ('gpt-4o' → 'openai/gpt-4o',
    // 'claude-*' → 'anthropic/claude-*', 'gemini-*' → 'google/gemini-*') so the
    // user's configured model keeps meaning the same thing.
    //
    // Vendored API keys and the OpenAI proxy are NULLed deliberately: a raw
    // OpenAI/Anthropic/Google key cannot authenticate against OpenRouter and
    // a proxy is no longer needed (browser-direct works). Nulling them flips
    // Capability off so users land on the AI Settings screen to paste their
    // OpenRouter key instead of hitting opaque 401s at AI-call time.
    version: 5,
    up: async (db) => {
      await db.exec(`
        ALTER TABLE user_profile
          DROP CONSTRAINT IF EXISTS user_profile_ai_provider_check;

        UPDATE user_profile SET ai_model = CASE
          WHEN ai_model LIKE 'gpt%' THEN 'openai/' || ai_model
          WHEN ai_model LIKE 'claude%' THEN 'anthropic/' || ai_model
          WHEN ai_model LIKE 'gemini%' THEN 'google/' || ai_model
          ELSE ai_model
        END;

        UPDATE user_profile
          SET ai_provider = 'openrouter',
              ai_api_key = NULL,
              ai_proxy_url = NULL;

        ALTER TABLE user_profile
          ALTER COLUMN ai_provider SET DEFAULT 'openrouter';
        ALTER TABLE user_profile
          ALTER COLUMN ai_model SET DEFAULT 'openai/gpt-4o-mini';

        ALTER TABLE user_profile
          ADD CONSTRAINT user_profile_ai_provider_check
          CHECK (ai_provider = 'openrouter');
      `);
    },
  },
  {
    // Weight unit setting (kg | lbs). Storage stays kg everywhere.
    //
    // Before this migration the set-row UI labelled workout_sets.weight_kg as
    // "lbs" (since b48b461, five days after the first commit) and the AI coach
    // prompted and answered in lbs, so stored lifting weights are pounds.
    // Existing profiles therefore switch to 'lbs' and lifting weights convert
    // lbs -> kg, so the user sees the same numbers as before. Body weight was
    // always entered as kg and is left alone. workout_sets is the only lifting
    // weight column (program targets carry no weight). Backups made before
    // this migration get the same treatment on import (see backup.ts).
    version: 6,
    up: async (db) => {
      await db.exec(`
        ALTER TABLE user_profile ADD COLUMN weight_unit TEXT NOT NULL DEFAULT 'kg'
          CHECK (weight_unit IN ('kg', 'lbs'));

        UPDATE user_profile SET weight_unit = 'lbs';

        UPDATE workout_sets SET weight_kg = weight_kg * 0.45359237
          WHERE weight_kg IS NOT NULL;
      `);
    },
  },
  {
    // Deleting a library Exercise used to cascade through every logged set,
    // Workout Log Exercise and note for it, wiping its history. History FKs
    // become RESTRICT, and an Exercise that has history is archived instead
    // (archived_at set: hidden from the library and pickers, still joined by
    // history and progress queries). See exerciseWriter.removeExercise.
    // program_exercises keeps CASCADE: a Program is a plan, not history.
    version: 7,
    up: async (db) => {
      await db.exec(`
        ALTER TABLE exercises ADD COLUMN archived_at TIMESTAMP;

        ALTER TABLE workout_log_exercises
          DROP CONSTRAINT workout_log_exercises_exercise_id_fkey,
          ADD CONSTRAINT workout_log_exercises_exercise_id_fkey
            FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT;

        ALTER TABLE workout_sets
          DROP CONSTRAINT workout_sets_exercise_id_fkey,
          ADD CONSTRAINT workout_sets_exercise_id_fkey
            FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT;

        ALTER TABLE exercise_notes
          DROP CONSTRAINT exercise_notes_exercise_id_fkey,
          ADD CONSTRAINT exercise_notes_exercise_id_fkey
            FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT;
      `);
    },
  },
  {
    // A Workout Log Exercise remembers the Program Exercise it was copied
    // from, so syncing a workout back to its Session matches row-for-row even
    // when the same Exercise appears twice. Older rows stay NULL and fall back
    // to matching by exercise_id.
    version: 8,
    up: async (db) => {
      await db.exec(`
        ALTER TABLE workout_log_exercises ADD COLUMN program_exercise_id INTEGER
          REFERENCES program_exercises(id) ON DELETE SET NULL;
      `);
    },
  },
  {
    // At most one Workout Log is in_progress (a double tap on Start used to
    // create two). Existing extras keep the newest; the rest close out the way
    // stale workouts do: 'incomplete' with a completed set, else 'missed'.
    version: 9,
    up: async (db) => {
      await db.exec(`
        WITH ranked AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY started_at DESC, id DESC) AS rn
          FROM workout_logs WHERE status = 'in_progress'
        )
        UPDATE workout_logs wl SET status = CASE
            WHEN EXISTS (
              SELECT 1 FROM workout_sets ws
              WHERE ws.workout_log_id = wl.id AND ws.completed_at IS NOT NULL
            ) THEN 'incomplete'
            ELSE 'missed'
          END
        FROM ranked
        WHERE ranked.id = wl.id AND ranked.rn > 1;

        CREATE UNIQUE INDEX one_in_progress_workout ON workout_logs (status)
          WHERE status = 'in_progress';
      `);
    },
  },
];

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

async function ensureMigrationsTable(db: PGlite): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function getCurrentVersion(db: PGlite): Promise<number> {
  const result = await db.query<{ max: number | null }>(
    'SELECT MAX(version) as max FROM schema_migrations',
  );
  return result.rows[0]?.max ?? 0;
}

/**
 * Run any migrations that haven't been applied yet.
 *
 * Each migration runs inside its own transaction — if it fails, that
 * migration rolls back but earlier ones stay committed. On a warm start
 * (schema already up to date) this costs one SELECT and returns immediately.
 *
 * `targetVersion` stops after that migration (exclusive end: migrations at or
 * below it run, later ones stay pending). Used by tests that need a
 * mid-history schema state; production always passes nothing (full run).
 */
export async function runPendingMigrations(
  db: PGlite,
  targetVersion?: number,
): Promise<void> {
  await ensureMigrationsTable(db);
  const current = await getCurrentVersion(db);

  const pending = migrations.filter(
    (m) =>
      m.version > current &&
      (targetVersion === undefined || m.version <= targetVersion),
  );
  if (pending.length === 0) return;

  for (const migration of pending) {
    await db.exec('BEGIN');
    try {
      await migration.up(db);
      await db.query('INSERT INTO schema_migrations (version) VALUES ($1)', [
        migration.version,
      ]);
      await db.exec('COMMIT');
    } catch (err) {
      await db.exec('ROLLBACK');
      throw err;
    }
  }
}
