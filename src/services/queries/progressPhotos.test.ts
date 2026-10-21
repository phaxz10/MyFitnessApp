import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../test/testDb';
import type { DB } from '../db';
import { insertPhoto, setThumb } from '../writers/progressPhotoWriter';
import {
  listPhotos,
  photoData,
  photosByDate,
  photosByDateRange,
  photosMissingThumb,
} from './progressPhotos';

let pg: PGlite;
let db: DB;

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
});

afterEach(async () => {
  await pg.close();
});

// Pin created_at so tie-breaking order is deterministic.
let tick = 0;
const add = async (
  date: string,
  thumb: string | null,
  data = `full-${date}`,
) => {
  await insertPhoto(db, {
    date,
    photo_data: data,
    thumb_data: thumb,
    photo_type: 'front',
  });
  tick += 1;
  await pg.query(
    `UPDATE progress_photos SET created_at = TIMESTAMP '2025-01-01 00:00:00' + ($1 || ' seconds')::interval
     WHERE id = (SELECT max(id) FROM progress_photos)`,
    [String(tick)],
  );
};

describe('listPhotos', () => {
  it('never returns photo_data and carries thumb_data', async () => {
    await add('2025-06-01', 'thumb-a');
    const rows = await listPhotos(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('photo_data');
    expect(rows[0].thumb_data).toBe('thumb-a');
    expect(rows[0].date).toBe('2025-06-01');
  });

  it('orders by date DESC, created_at DESC', async () => {
    await add('2025-06-01', 't1');
    await add('2025-06-03', 't2');
    await add('2025-06-03', 't3');
    const rows = await listPhotos(db);
    expect(rows.map((r) => r.thumb_data)).toEqual(['t3', 't2', 't1']);
  });
});

describe('photosByDate / photosByDateRange', () => {
  it('filters by date with created_at ASC and omits photo_data', async () => {
    await add('2025-06-01', 'a');
    await add('2025-06-01', 'b');
    await add('2025-06-02', 'c');
    const rows = await photosByDate(db, '2025-06-01');
    expect(rows.map((r) => r.thumb_data)).toEqual(['a', 'b']);
    expect(rows[0]).not.toHaveProperty('photo_data');
  });

  it('range is inclusive, date DESC then created_at ASC', async () => {
    await add('2025-06-01', 'a');
    await add('2025-06-02', 'b');
    await add('2025-06-02', 'c');
    await add('2025-06-09', 'd');
    const rows = await photosByDateRange(db, '2025-06-01', '2025-06-02');
    expect(rows.map((r) => r.thumb_data)).toEqual(['b', 'c', 'a']);
    expect(rows[0]).not.toHaveProperty('photo_data');
  });
});

describe('photoData', () => {
  it('returns the full image, or null when missing', async () => {
    await add('2025-06-01', 't', 'data:image/jpeg;base64,FULL');
    const [row] = await listPhotos(db);
    expect(await photoData(db, row.id)).toBe('data:image/jpeg;base64,FULL');
    expect(await photoData(db, 9999)).toBeNull();
  });
});

describe('photosMissingThumb', () => {
  it('lists rows with an image but no thumb, until setThumb fills it', async () => {
    await add('2025-06-01', null);
    await add('2025-06-02', 'has-thumb');
    await pg.query(
      `INSERT INTO progress_photos (date, photo_data, thumb_data) VALUES ('2025-06-03', NULL, NULL)`,
    );
    const missing = await photosMissingThumb(db);
    expect(missing).toHaveLength(1);
    await setThumb(db, missing[0], 'new-thumb');
    expect(await photosMissingThumb(db)).toEqual([]);
    const rows = await listPhotos(db);
    expect(rows.find((r) => r.id === missing[0])?.thumb_data).toBe('new-thumb');
  });
});
