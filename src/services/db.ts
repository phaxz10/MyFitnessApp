import { PGlite } from '@electric-sql/pglite';
import { runPendingMigrations } from './migrator';

let db: PGlite | null = null;

export async function getDB(): Promise<PGlite> {
  if (!db) {
    db = new PGlite('idb://mypersonalfitness');
    await runPendingMigrations(db);
  }
  return db;
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
    DROP TABLE IF EXISTS schema_migrations CASCADE;
    DROP TABLE IF EXISTS weekly_reviews CASCADE;
    DROP TABLE IF EXISTS progress_photos CASCADE;
    DROP TABLE IF EXISTS ai_goal_reviews CASCADE;
    DROP TABLE IF EXISTS workout_sets CASCADE;
    DROP TABLE IF EXISTS workout_log_exercises CASCADE;
    DROP TABLE IF EXISTS workout_logs CASCADE;
    DROP TABLE IF EXISTS program_exercises CASCADE;
    DROP TABLE IF EXISTS program_sessions CASCADE;
    DROP TABLE IF EXISTS workout_programs CASCADE;
    DROP TABLE IF EXISTS exercises CASCADE;
    DROP TABLE IF EXISTS food_entries CASCADE;
    DROP TABLE IF EXISTS weight_logs CASCADE;
    DROP TABLE IF EXISTS user_profile CASCADE;
  `);
  await runPendingMigrations(database);
}
