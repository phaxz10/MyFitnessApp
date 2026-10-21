import type { PGlite, PGliteInterface } from '@electric-sql/pglite';
import { PGliteWorker } from '@electric-sql/pglite/worker';
import DbWorker from './db.worker.ts?worker';
import { runPendingMigrations } from './migrator';

/** Anything that can run SQL: the wrapper, a transaction, or a raw PGlite. */
export type Queryable = Pick<PGlite, 'query' | 'exec'>;

/**
 * The app's DB handle. `transaction(fn)` runs fn atomically on a handle that
 * is itself a DB (a nested call joins the outer transaction). Inside fn use
 * only the handle fn receives: the outer one waits for the transaction lock.
 */
export type DB = Queryable & {
  transaction<T>(fn: (tx: DB) => Promise<T>): Promise<T>;
};

export type WriteEvent = { table: string; op: 'insert' | 'update' | 'delete' };

const writeListeners: Array<(event: WriteEvent) => void> = [];

export function onDbWrite(fn: (event: WriteEvent) => void): void {
  writeListeners.push(fn);
}

const MUTATION_RE = /^\s*(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(\w+)/i;

/** One write event per mutating statement in `sql` (exec may hold many). */
function mutationEvents(sql: string): WriteEvent[] {
  const events: WriteEvent[] = [];
  for (const statement of sql.split(';')) {
    const match = statement.match(MUTATION_RE);
    if (!match) continue;
    const op = match[1].split(/\s/)[0].toLowerCase() as WriteEvent['op'];
    events.push({ table: match[2], op });
  }
  return events;
}

function emit(events: WriteEvent[]): void {
  for (const event of events) {
    for (const fn of writeListeners) fn(event);
  }
}

// The DB facade over a runner (the PGlite, or an open transaction). `record`
// receives write events: published at once outside a transaction, buffered
// until COMMIT inside one.
function facade(
  runner: Queryable,
  record: (events: WriteEvent[]) => void,
  transaction: DB['transaction'],
): DB {
  return {
    query: ((...args: [string, ...unknown[]]) => {
      const promise = runner.query(...(args as Parameters<PGlite['query']>));
      // The caller owns the rejection (it gets `promise`); the derived chain
      // must not surface it a second time as an unhandled rejection.
      promise.then(
        () => record(mutationEvents(args[0])),
        () => {},
      );
      return promise;
    }) as PGlite['query'],
    exec: (async (sql: string, options?: Parameters<PGlite['exec']>[1]) => {
      const result = await runner.exec(sql, options);
      record(mutationEvents(sql));
      return result;
    }) as PGlite['exec'],
    transaction,
  };
}

/**
 * Wrap a raw PGlite (tests: in-memory) or PGliteWorker (production): every
 * mutating query publishes on the Write Bus, and `transaction` runs
 * multi-statement writes atomically. Exported so tests wrap an in-memory
 * PGlite exactly like production.
 */
export function createDB(raw: PGliteInterface): DB {
  const transaction: DB['transaction'] = async (fn) => {
    const pending: WriteEvent[] = [];
    const result = await raw.transaction(async (rawTx) => {
      const tx: DB = facade(
        rawTx,
        (events) => pending.push(...events),
        (inner) => inner(tx),
      );
      return fn(tx);
    });
    emit(pending); // after COMMIT only; a rollback throws past this line
    return result;
  };
  return facade(raw, emit, transaction);
}

const DATA_DIR = 'idb://mypersonalfitness';
// db.worker.ts broadcasts a failed open (Migration error) here.
const DB_OPEN_ERROR_CHANNEL = 'mypersonalfitness-db-open-error';

let pglite: PGliteWorker | null = null;
let dbPromise: Promise<DB> | null = null;

// PGlite runs in a Web Worker (db.worker.ts) so queries and IndexedDB flushes
// stay off the UI thread. The worker runs the Migrations before it answers.
// A fixed `id` keeps every tab, across app versions (the worker chunk URL
// changes per build), in one leader election, so only one PGlite ever opens
// the data dir.
export function getDB(): Promise<DB> {
  if (!dbPromise) {
    const errors = new BroadcastChannel(DB_OPEN_ERROR_CHANNEL);
    const openFailed = new Promise<never>((_, reject) => {
      errors.onmessage = (event: MessageEvent<{ message: string }>) =>
        reject(new Error(`Database failed to open: ${event.data.message}`));
    });
    openFailed.catch(() => {}); // observed via the race below
    dbPromise = (async () => {
      let handle: PGliteWorker | null = null;
      try {
        handle = await PGliteWorker.create(new DbWorker(), {
          dataDir: DATA_DIR,
          id: DATA_DIR,
        });
        // Ready = connected to the leader, whose Migrations have finished.
        await Promise.race([handle.waitReady, openFailed]);
        // The leader may be an older app version still open in another tab:
        // bring the schema up to this tab's Migrations (a no-op SELECT when
        // the leader already ran them).
        await runPendingMigrations(handle);
        pglite = handle;
        return createDB(handle);
      } catch (err) {
        // Terminate the worker so it gives up the leader lock and a retry
        // (or another tab) can elect a fresh leader.
        await handle?.close();
        throw err;
      } finally {
        errors.close();
      }
    })();
    dbPromise.catch(() => {
      dbPromise = null; // let the next caller retry a failed open
    });
  }
  return dbPromise;
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
    DROP TABLE IF EXISTS exercise_notes CASCADE;
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
