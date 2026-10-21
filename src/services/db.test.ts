/// <reference types="node" />
import type { PGlite, PGliteInterface } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../test/testDb';
import { createDB, onDbWrite, type WriteEvent } from './db';
import { runPendingMigrations } from './migrator';

let pg: PGlite;
let db: ReturnType<typeof createDB>;
let events: WriteEvent[];

// onDbWrite has no unsubscribe; one listener feeding the current array.
let sink: WriteEvent[] = [];
onDbWrite((e) => sink.push(e));

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
  events = [];
  sink = events;
});

afterEach(async () => {
  await pg.close();
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Write Bus', () => {
  it('a failed query rejects to the caller without an unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      await expect(
        db.query('INSERT INTO no_such_table (x) VALUES (1)'),
      ).rejects.toThrow();
      await flush();
      await flush();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(unhandled).toEqual([]);
    expect(events).toEqual([]);
  });

  it('exec() writes emit, one event per mutating statement', async () => {
    await db.exec(`
      INSERT INTO exercises (name) VALUES ('Squat');
      UPDATE exercises SET name = 'Back Squat';
      SELECT 1;
    `);
    await flush();
    expect(events).toEqual([
      { table: 'exercises', op: 'insert' },
      { table: 'exercises', op: 'update' },
    ]);
  });
});

describe('transaction', () => {
  it('commits all statements and emits only after commit', async () => {
    const seenInside: WriteEvent[][] = [];
    await db.transaction(async (tx) => {
      await tx.query("INSERT INTO exercises (name) VALUES ('Bench')");
      await tx.query("INSERT INTO exercises (name) VALUES ('Row')");
      seenInside.push([...events]);
    });
    await flush();
    expect(seenInside).toEqual([[]]);
    expect(events).toEqual([
      { table: 'exercises', op: 'insert' },
      { table: 'exercises', op: 'insert' },
    ]);
    const n = await pg.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM exercises',
    );
    expect(n.rows[0].n).toBe(2);
  });

  it('rolls back everything and emits nothing when the callback throws', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query("INSERT INTO exercises (name) VALUES ('Bench')");
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await flush();
    expect(events).toEqual([]);
    const n = await pg.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM exercises',
    );
    expect(n.rows[0].n).toBe(0);
  });

  it('nested transaction joins the outer one', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.transaction(async (inner) => {
          await inner.query("INSERT INTO exercises (name) VALUES ('Bench')");
        });
        throw new Error('outer fails');
      }),
    ).rejects.toThrow();
    const n = await pg.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM exercises',
    );
    expect(n.rows[0].n).toBe(0);
  });
});

// Production wraps a PGliteWorker; only the shared PGliteInterface (query,
// exec, transaction, all on BasePGlite) may be relied on, so tests type the
// raw handle as that interface rather than the concrete PGlite.
describe('createDB over the PGliteInterface (PGliteWorker shape)', () => {
  it('wraps any PGliteInterface: Write Bus and transaction work', async () => {
    const raw: PGliteInterface = pg;
    const wrapped = createDB(raw);
    await wrapped.transaction(async (tx) => {
      await tx.query("INSERT INTO exercises (name) VALUES ('Squat')");
    });
    await flush();
    expect(events).toEqual([{ table: 'exercises', op: 'insert' }]);
  });

  it('re-running migrations through the interface is a no-op (run once)', async () => {
    const raw: PGliteInterface = pg;
    const before = await pg.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM schema_migrations',
    );
    await runPendingMigrations(raw);
    const after = await pg.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM schema_migrations',
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});
