import { PGlite } from '@electric-sql/pglite';
import { createDB } from '../services/db';
import { runPendingMigrations } from '../services/migrator';

/**
 * An in-memory PGlite with the REAL schema (every Migration applied), plus
 * the production DB wrapper around it (Write Bus, transactions). Tests use
 * this instead of hand-copied CREATE TABLE statements so they exercise the
 * schema users actually have. Close `pg` in afterEach.
 */
export async function createTestDb() {
  const pg = new PGlite();
  await runPendingMigrations(pg);
  return { pg, db: createDB(pg) };
}
