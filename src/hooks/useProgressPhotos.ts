import { useCallback, useState } from 'react';
import { getDB } from '../services/db';
import type { PhotoType, ProgressPhoto } from '../types';

export function useProgressPhotos() {
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPhotosByDate = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const db = await getDB();
      const result = await db.query(
        'SELECT * FROM progress_photos WHERE date = $1 ORDER BY created_at',
        [date],
      );
      setPhotos(result.rows as ProgressPhoto[]);
      return result.rows as ProgressPhoto[];
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch photos');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAllPhotos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const db = await getDB();
      const result = await db.query(
        'SELECT * FROM progress_photos ORDER BY date DESC, created_at DESC',
      );
      setPhotos(result.rows as ProgressPhoto[]);
      return result.rows as ProgressPhoto[];
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch photos');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const addPhoto = useCallback(
    async (data: {
      date: string;
      photo_data: string;
      photo_type: PhotoType;
      notes?: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        await db.query(
          `INSERT INTO progress_photos (date, photo_data, photo_type, notes)
           VALUES ($1, $2, $3, $4)`,
          [data.date, data.photo_data, data.photo_type, data.notes || null],
        );
        await fetchPhotosByDate(data.date);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add photo');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchPhotosByDate],
  );

  const deletePhoto = useCallback(
    async (id: number, date: string) => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        await db.query('DELETE FROM progress_photos WHERE id = $1', [id]);
        await fetchPhotosByDate(date);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete photo');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchPhotosByDate],
  );

  const getPhotosByDateRange = useCallback(
    async (startDate: string, endDate: string) => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        const result = await db.query(
          'SELECT * FROM progress_photos WHERE date >= $1 AND date <= $2 ORDER BY date DESC, created_at',
          [startDate, endDate],
        );
        return result.rows as ProgressPhoto[];
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch photos');
        return [];
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return {
    photos,
    loading,
    error,
    fetchPhotosByDate,
    fetchAllPhotos,
    addPhoto,
    deletePhoto,
    getPhotosByDateRange,
  };
}
