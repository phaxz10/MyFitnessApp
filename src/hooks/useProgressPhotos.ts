import { useCallback, useEffect, useRef, useState } from 'react';
import { makeThumbnail } from '../components/body/compressImage';
import { getDB } from '../services/db';
import {
  listPhotos,
  photoData,
  photosByDate,
  photosByDateRange,
} from '../services/queries/progressPhotos';
import {
  deletePhoto as deletePhotoRow,
  insertPhoto,
  type NewProgressPhoto,
  setThumb,
} from '../services/writers/progressPhotoWriter';
import type { ProgressPhotoSummary } from '../types';

/**
 * Photo ids whose thumbnail generation failed this session. Module-level so a
 * bad image is not retried in a loop across re-renders or remounts.
 */
const failedThumbIds = new Set<number>();

export function useProgressPhotos() {
  const [photos, setPhotos] = useState<ProgressPhotoSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backfilling = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetchPhotosByDate = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const db = await getDB();
      const rows = await photosByDate(db, date);
      setPhotos(rows);
      return rows;
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
      const rows = await listPhotos(db);
      setPhotos(rows);
      return rows;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch photos');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const addPhoto = useCallback(
    async (data: NewProgressPhoto) => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        await insertPhoto(db, data);
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
        await deletePhotoRow(db, id);
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
        return await photosByDateRange(db, startDate, endDate);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch photos');
        return [];
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Lazy thumbnail backfill: old rows and restored backups have no thumb.
  // Generate them one at a time, updating the list as each one lands.
  const nextMissing = photos.find(
    (p) => p.thumb_data === null && !failedThumbIds.has(p.id),
  );
  const nextMissingId = nextMissing?.id;
  // Re-run whenever the pending set changes (a completed or failed id changes
  // `nextMissingId`, so the chain continues).
  useEffect(() => {
    if (nextMissingId === undefined || backfilling.current) return;
    backfilling.current = true;
    const id = nextMissingId;
    (async () => {
      try {
        const db = await getDB();
        const full = await photoData(db, id);
        if (!full) throw new Error('No image data');
        const thumb = await makeThumbnail(full);
        await setThumb(db, id, thumb);
        if (mounted.current) {
          setPhotos((prev) =>
            prev.map((p) => (p.id === id ? { ...p, thumb_data: thumb } : p)),
          );
        }
      } catch {
        failedThumbIds.add(id);
        if (mounted.current) setPhotos((prev) => [...prev]);
      } finally {
        backfilling.current = false;
      }
    })();
  }, [nextMissingId]);

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
