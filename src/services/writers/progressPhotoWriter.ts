/** Progress photo writes (INSERT / UPDATE / DELETE). */

import type { PhotoType } from '../../types';
import type { DB } from '../db';

export interface NewProgressPhoto {
  date: string;
  photo_data: string;
  thumb_data: string | null;
  photo_type: PhotoType;
  notes?: string | null;
}

export async function insertPhoto(
  db: DB,
  photo: NewProgressPhoto,
): Promise<void> {
  await db.query(
    `INSERT INTO progress_photos (date, photo_data, thumb_data, photo_type, notes)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      photo.date,
      photo.photo_data,
      photo.thumb_data,
      photo.photo_type,
      photo.notes || null,
    ],
  );
}

export async function deletePhoto(db: DB, id: number): Promise<void> {
  await db.query('DELETE FROM progress_photos WHERE id = $1', [id]);
}

export async function setThumb(
  db: DB,
  id: number,
  thumb: string,
): Promise<void> {
  await db.query('UPDATE progress_photos SET thumb_data = $1 WHERE id = $2', [
    thumb,
    id,
  ]);
}
