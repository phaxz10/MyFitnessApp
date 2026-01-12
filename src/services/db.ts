import { PGlite } from '@electric-sql/pglite';

let db: PGlite | null = null;

export async function getDB(): Promise<PGlite> {
  if (!db) {
    db = new PGlite('idb://mypersonalfitness');
    await initSchema();
  }
  return db;
}

async function initSchema(): Promise<void> {
  if (!db) return;

  await db.exec(`
    -- User Profile Table
    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY DEFAULT 1,
      age INTEGER NOT NULL,
      gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
      height_cm REAL NOT NULL,
      activity_level TEXT NOT NULL CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active')),
      goal TEXT NOT NULL CHECK (goal IN ('bulk', 'lean_bulk', 'recomp', 'cut', 'maintain')),
      target_rate_kg_per_week REAL DEFAULT 0,
      calorie_target INTEGER NOT NULL,
      protein_target_g INTEGER NOT NULL,
      carbs_target_g INTEGER NOT NULL,
      fat_target_g INTEGER NOT NULL,
      gemini_api_key TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Weight Logs Table
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

    -- Food Entries Table
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

    -- Exercises Table
    CREATE TABLE IF NOT EXISTS exercises (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      muscle_groups TEXT,
      equipment TEXT,
      video_url TEXT,
      exercise_type TEXT NOT NULL DEFAULT 'reps_weight' CHECK (exercise_type IN ('reps_weight', 'reps_only', 'duration', 'duration_weight')),
      is_ai_generated BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Workout Programs Table
    CREATE TABLE IF NOT EXISTS workout_programs (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      sessions_per_week INTEGER NOT NULL,
      is_active BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Program Sessions Table
    CREATE TABLE IF NOT EXISTS program_sessions (
      id SERIAL PRIMARY KEY,
      program_id INTEGER NOT NULL REFERENCES workout_programs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      day_of_week INTEGER,
      order_index INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Program Exercises Table
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

    -- Workout Logs Table
    CREATE TABLE IF NOT EXISTS workout_logs (
      id SERIAL PRIMARY KEY,
      program_id INTEGER REFERENCES workout_programs(id) ON DELETE SET NULL,
      session_id INTEGER REFERENCES program_sessions(id) ON DELETE SET NULL,
      date DATE NOT NULL,
      started_at TIMESTAMP NOT NULL,
      ended_at TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Workout Sets Table
    CREATE TABLE IF NOT EXISTS workout_sets (
      id SERIAL PRIMARY KEY,
      workout_log_id INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      set_number INTEGER NOT NULL,
      reps INTEGER,
      weight_kg REAL,
      duration_seconds INTEGER,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Exercise Notes Table (per-exercise notes tied to master exercise)
    CREATE TABLE IF NOT EXISTS exercise_notes (
      id SERIAL PRIMARY KEY,
      exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- AI Goal Reviews Table
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

    -- Weekly Reviews Table
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

    -- Progress Photos Table
    CREATE TABLE IF NOT EXISTS progress_photos (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      photo_data TEXT NOT NULL,
      photo_type TEXT DEFAULT 'front',
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_food_entries_date ON food_entries(date);
    CREATE INDEX IF NOT EXISTS idx_weight_logs_date ON weight_logs(date);
    CREATE INDEX IF NOT EXISTS idx_workout_logs_date ON workout_logs(date);
    CREATE INDEX IF NOT EXISTS idx_program_sessions_program ON program_sessions(program_id);
    CREATE INDEX IF NOT EXISTS idx_program_exercises_session ON program_exercises(session_id);
    CREATE INDEX IF NOT EXISTS idx_workout_sets_log ON workout_sets(workout_log_id);
    CREATE INDEX IF NOT EXISTS idx_progress_photos_date ON progress_photos(date);
    CREATE INDEX IF NOT EXISTS idx_exercise_notes_exercise ON exercise_notes(exercise_id);
  `);

  // Migration: Add video_url column to exercises if it doesn't exist
  try {
    await db.exec(`
      ALTER TABLE exercises ADD COLUMN IF NOT EXISTS video_url TEXT;
    `);
  } catch {
    // Column may already exist or table doesn't support IF NOT EXISTS, ignore
  }

  // Migration: Add exercise_type column to exercises
  try {
    await db.exec(`
      ALTER TABLE exercises ADD COLUMN IF NOT EXISTS exercise_type TEXT DEFAULT 'reps_weight';
    `);
  } catch {
    // Column may already exist, ignore
  }

  // Migration: Add target_duration_seconds and superset_group_id to program_exercises
  try {
    await db.exec(`
      ALTER TABLE program_exercises ADD COLUMN IF NOT EXISTS target_duration_seconds INTEGER;
      ALTER TABLE program_exercises ADD COLUMN IF NOT EXISTS superset_group_id TEXT;
    `);
  } catch {
    // Columns may already exist, ignore
  }

  // Migration: Make target_rep_min and target_rep_max nullable for duration exercises
  // and add duration_seconds to workout_sets
  try {
    await db.exec(`
      ALTER TABLE program_exercises ALTER COLUMN target_rep_min DROP NOT NULL;
      ALTER TABLE program_exercises ALTER COLUMN target_rep_max DROP NOT NULL;
    `);
  } catch {
    // Columns may already be nullable, ignore
  }

  try {
    await db.exec(`
      ALTER TABLE workout_sets ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
    `);
  } catch {
    // Column may already exist, ignore
  }
}

// Helper function to check if onboarding is complete
export async function isOnboardingComplete(): Promise<boolean> {
  const database = await getDB();
  const result = await database.query(
    'SELECT COUNT(*) as count FROM user_profile',
  );
  const rows = result.rows as { count: number }[];
  return rows[0].count > 0;
}

// Helper function to reset database (for development/testing)
export async function resetDatabase(): Promise<void> {
  const database = await getDB();
  await database.exec(`
    DROP TABLE IF EXISTS weekly_reviews CASCADE;
    DROP TABLE IF EXISTS progress_photos CASCADE;
    DROP TABLE IF EXISTS ai_goal_reviews CASCADE;
    DROP TABLE IF EXISTS workout_sets CASCADE;
    DROP TABLE IF EXISTS workout_logs CASCADE;
    DROP TABLE IF EXISTS program_exercises CASCADE;
    DROP TABLE IF EXISTS program_sessions CASCADE;
    DROP TABLE IF EXISTS workout_programs CASCADE;
    DROP TABLE IF EXISTS exercises CASCADE;
    DROP TABLE IF EXISTS food_entries CASCADE;
    DROP TABLE IF EXISTS weight_logs CASCADE;
    DROP TABLE IF EXISTS user_profile CASCADE;
  `);
  await initSchema();
}
