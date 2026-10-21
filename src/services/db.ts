import { PGlite } from '@electric-sql/pglite';
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
 * Wrap a raw PGlite: every mutating query publishes on the Write Bus, and
 * `transaction` runs multi-statement writes atomically. Exported so tests wrap
 * an in-memory PGlite exactly like production.
 */
export function createDB(raw: PGlite): DB {
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

let pglite: PGlite | null = null;
let db: DB | null = null;

export async function getDB(): Promise<DB> {
  if (!db) {
    pglite = new PGlite('idb://mypersonalfitness');
    await runPendingMigrations(pglite);
    db = createDB(pglite);
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
