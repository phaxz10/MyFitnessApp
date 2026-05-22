import { PGlite } from '@electric-sql/pglite';
import { runPendingMigrations } from './migrator';

export type DB = Pick<PGlite, 'query' | 'exec'>;

export type WriteEvent = { table: string; op: 'insert' | 'update' | 'delete' };

const writeListeners: Array<(event: WriteEvent) => void> = [];

export function onDbWrite(fn: (event: WriteEvent) => void): void {
  writeListeners.push(fn);
}

const MUTATION_RE = /^\s*(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(\w+)/i;

function emitIfMutation(sql: string): void {
  const match = sql.match(MUTATION_RE);
  if (!match) return;
  const op = match[1].split(/\s/)[0].toLowerCase() as WriteEvent['op'];
  const table = match[2];
  const event: WriteEvent = { table, op };
  for (const fn of writeListeners) fn(event);
}

let pglite: PGlite | null = null;
let db: DB | null = null;

export async function getDB(): Promise<DB> {
  if (!db) {
    pglite = new PGlite('idb://mypersonalfitness');
    await runPendingMigrations(pglite);
    const raw = pglite;
    db = {
      query: ((...args: [string, ...unknown[]]) => {
        const promise = raw.query(...(args as Parameters<PGlite['query']>));
        promise.then(() => emitIfMutation(args[0]));
        return promise;
      }) as PGlite['query'],
      exec: raw.exec.bind(raw),
    };
  }
  return db;
}

export async function isOnboardingComplete(): Promise<boolean> {
  const database = await getDB();
  const result = await database.query(
    'SELECT COUNT(*) as count FROM user_profile',
  );
  const rows = result.rows as { count: number }[];
  return rows[0].count > 0;
}

export async function resetDatabase(): Promise<void> {
  await getDB();
  await pglite!.exec(`
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
  await runPendingMigrations(pglite!);
}
