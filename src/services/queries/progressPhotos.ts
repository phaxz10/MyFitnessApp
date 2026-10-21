/**
 * Progress Photos query module
 *
 * List reads select the small `thumb_data` column and NEVER `photo_data`, so
 * listing photos does not drag every full-size base64 image through PGlite.
 * The full image is fetched on demand, one id at a time, via `photoData`.
 */

import type { ProgressPhotoSummary } from '../../types';
import { pgDate, pgTimestamp } from '../../utils/pgValues';
import type { Queryable } from '../db';

const SUMMARY_COLUMNS = 'id, date, photo_type, notes, created_at, thumb_data';

function normalizeRow(row: Record<string, unknown>): ProgressPhotoSummary {
  return {
    ...row,
    date: pgDate(row.date),
    created_at: pgTimestamp(row.created_at),
    thumb_data: (row.thumb_data as string | null) ?? null,
  } as ProgressPhotoSummary;
}

export async function listPhotos(
  db: Queryable,
): Promise<ProgressPhotoSummary[]> {
  const result = await db.query(
    `SELECT ${SUMMARY_COLUMNS} FROM progress_photos ORDER BY date DESC, created_at DESC`,
  );
  return (result.rows as Record<string, unknown>[]).map(normalizeRow);
}

export async function photosByDate(
  db: Queryable,
  date: string,
): Promise<ProgressPhotoSummary[]> {
  const result = await db.query(
    `SELECT ${SUMMARY_COLUMNS} FROM progress_photos WHERE date = $1 ORDER BY created_at`,
    [date],
  );
  return (result.rows as Record<string, unknown>[]).map(normalizeRow);
}

export async function photosByDateRange(
  db: Queryable,
  startDate: string,
  endDate: string,
): Promise<ProgressPhotoSummary[]> {
  const result = await db.query(
    `SELECT ${SUMMARY_COLUMNS} FROM progress_photos WHERE date >= $1 AND date <= $2 ORDER BY date DESC, created_at`,
    [startDate, endDate],
  );
  return (result.rows as Record<string, unknown>[]).map(normalizeRow);
}

/** The full-size data URL for one photo, or null if missing/empty. */
export async function photoData(
  db: Queryable,
  id: number,
): Promise<string | null> {
  const result = await db.query(
    'SELECT photo_data FROM progress_photos WHERE id = $1',
    [id],
  );
  const row = result.rows[0] as { photo_data: string | null } | undefined;
  return row?.photo_data ?? null;
}

/** Ids of photos that have an image but no thumbnail yet. */
export async function photosMissingThumb(db: Queryable): Promise<number[]> {
  const result = await db.query(
    `SELECT id FROM progress_photos
     WHERE thumb_data IS NULL AND photo_data IS NOT NULL
     ORDER BY date DESC, created_at DESC`,
  );
  return (result.rows as { id: number }[]).map((r) => r.id);
}
