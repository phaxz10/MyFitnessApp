import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../test/testDb';
import type { DB } from '../db';
import { weightLogForDate } from './weightLogs';

let pg: PGlite;
let db: DB;

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
});

afterEach(async () => {
  await pg.close();
});

describe('weightLogForDate', () => {
  it('returns only the entry for that date, or null', async () => {
    await db.query(
      `INSERT INTO weight_logs (date, weight_kg) VALUES ('2025-06-01', 80), ('2025-06-02', 81)`,
    );
    const log = await weightLogForDate(db, '2025-06-02');
    expect(log?.weight_kg).toBe(81);
    expect(await weightLogForDate(db, '2025-06-03')).toBeNull();
  });
});
