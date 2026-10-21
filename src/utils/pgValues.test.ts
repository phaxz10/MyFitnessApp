import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseLocalTimestamp } from './date';
import { pgDate, pgTimestamp } from './pgValues';

// West of UTC is where PGlite's UTC-midnight DATE values shift a day under
// local-time formatting (Node re-reads TZ when it changes).
vi.stubEnv('TZ', 'America/New_York');

let db: PGlite;
let row: { d: unknown; ts: unknown };

beforeAll(async () => {
  db = new PGlite();
  const result = await db.query(
    `SELECT '2025-05-20'::date AS d, '2025-05-20T09:00:00'::timestamp AS ts`,
  );
  row = result.rows[0] as typeof row;
});

afterAll(async () => {
  await db.close();
});

describe('pgDate', () => {
  it('reads a PGlite DATE (a Date object) back as its calendar day', () => {
    expect(row.d).toBeInstanceOf(Date);
    expect(pgDate(row.d)).toBe('2025-05-20');
  });

  it('passes date strings through and maps null to empty', () => {
    expect(pgDate('2025-05-20')).toBe('2025-05-20');
    expect(pgDate(null)).toBe('');
  });
});

describe('pgTimestamp', () => {
  it('returns a string parseLocalTimestamp reads as the stored local time', () => {
    expect(row.ts).toBeInstanceOf(Date);
    const parsed = parseLocalTimestamp(pgTimestamp(row.ts));
    expect(parsed.getTime()).toBe(new Date(2025, 4, 20, 9, 0, 0).getTime());
  });
});
