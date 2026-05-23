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
        CREATE TABLE user_profile (
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

        CREATE TABLE weight_logs (
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

        CREATE TABLE food_entries (
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

        CREATE TABLE exercises (
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

        CREATE TABLE workout_programs (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          sessions_per_week INTEGER NOT NULL,
          is_active BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE program_sessions (
          id SERIAL PRIMARY KEY,
          program_id INTEGER NOT NULL REFERENCES workout_programs(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          day_of_week INTEGER,
          order_index INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE program_exercises (
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

        CREATE TABLE workout_logs (
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

        CREATE TABLE workout_log_exercises (
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

        CREATE TABLE workout_sets (
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

        CREATE TABLE exercise_notes (
          id SERIAL PRIMARY KEY,
          exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE ai_goal_reviews (
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

        CREATE TABLE weekly_reviews (
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

        CREATE TABLE progress_photos (
          id SERIAL PRIMARY KEY,
          date DATE NOT NULL,
          photo_data TEXT NOT NULL,
          photo_type TEXT DEFAULT 'front',
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Indexes
        CREATE INDEX idx_food_entries_date ON food_entries(date);
        CREATE INDEX idx_weight_logs_date ON weight_logs(date);
        CREATE INDEX idx_workout_logs_date ON workout_logs(date);
        CREATE INDEX idx_program_sessions_program ON program_sessions(program_id);
        CREATE INDEX idx_program_exercises_session ON program_exercises(session_id);
        CREATE INDEX idx_workout_sets_log ON workout_sets(workout_log_id);
        CREATE INDEX idx_progress_photos_date ON progress_photos(date);
        CREATE INDEX idx_exercise_notes_exercise ON exercise_notes(exercise_id);
        CREATE INDEX idx_workout_log_exercises_log ON workout_log_exercises(workout_log_id);
        CREATE INDEX idx_workout_sets_exercise ON workout_sets(exercise_id);
        CREATE INDEX idx_workout_sets_wle ON workout_sets(workout_log_exercise_id);
        CREATE INDEX idx_workout_logs_completed ON workout_logs(status) WHERE status = 'completed';
        CREATE INDEX idx_workout_sets_completed_at ON workout_sets(completed_at);
      `);
    },
  },
  {
    // Allow NULL photo_data for lazy-loading photos from Google Drive backup.
    version: 2,
    up: async (db) => {
      await db.exec(
        `ALTER TABLE progress_photos ALTER COLUMN photo_data DROP NOT NULL`,
      );
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
 */
export async function runPendingMigrations(db: PGlite): Promise<void> {
  await ensureMigrationsTable(db);
  const current = await getCurrentVersion(db);

  const pending = migrations.filter((m) => m.version > current);
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
