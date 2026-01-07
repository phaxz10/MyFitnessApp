import { useState, useCallback } from 'react';
import { getDB } from '../services/db';
import type { Exercise } from '../types';

export function useExercises() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExercises = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const db = await getDB();
      const result = await db.query('SELECT * FROM exercises ORDER BY name');
      setExercises(result.rows as Exercise[]);
      return result.rows as Exercise[];
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch exercises',
      );
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const getExerciseById = useCallback(
    async (id: number): Promise<Exercise | null> => {
      try {
        const db = await getDB();
        const result = await db.query('SELECT * FROM exercises WHERE id = $1', [
          id,
        ]);
        const rows = result.rows as Exercise[];
        return rows.length > 0 ? rows[0] : null;
      } catch {
        return null;
      }
    },
    [],
  );

  const addExercise = useCallback(
    async (exercise: Omit<Exercise, 'id' | 'created_at'>): Promise<number> => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        const result = await db.query(
          `INSERT INTO exercises (name, description, muscle_groups, equipment, video_url, is_ai_generated)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
          [
            exercise.name,
            exercise.description,
            exercise.muscle_groups,
            exercise.equipment,
            exercise.video_url,
            exercise.is_ai_generated,
          ],
        );
        await fetchExercises();
        const rows = result.rows as { id: number }[];
        return rows[0].id;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add exercise');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchExercises],
  );

  const updateExercise = useCallback(
    async (id: number, data: Partial<Exercise>) => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        const fields: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        Object.entries(data).forEach(([key, value]) => {
          if (key !== 'id' && key !== 'created_at' && value !== undefined) {
            fields.push(`${key} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
          }
        });

        if (fields.length > 0) {
          values.push(id);
          await db.query(
            `UPDATE exercises SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
            values,
          );
          await fetchExercises();
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to update exercise',
        );
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchExercises],
  );

  const deleteExercise = useCallback(
    async (id: number) => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        await db.query('DELETE FROM exercises WHERE id = $1', [id]);
        await fetchExercises();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to delete exercise',
        );
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchExercises],
  );

  const searchExercises = useCallback(
    async (query: string): Promise<Exercise[]> => {
      try {
        const db = await getDB();
        const result = await db.query(
          `SELECT * FROM exercises 
         WHERE LOWER(name) LIKE LOWER($1) 
         OR LOWER(muscle_groups) LIKE LOWER($1)
         ORDER BY name`,
          [`%${query}%`],
        );
        return result.rows as Exercise[];
      } catch {
        return [];
      }
    },
    [],
  );

  const addExercisesBatch = useCallback(
    async (
      exerciseList: Omit<Exercise, 'id' | 'created_at'>[],
    ): Promise<number[]> => {
      setLoading(true);
      setError(null);
      const ids: number[] = [];
      try {
        const db = await getDB();
        for (const exercise of exerciseList) {
          const result = await db.query(
            `INSERT INTO exercises (name, description, muscle_groups, equipment, video_url, is_ai_generated)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
            [
              exercise.name,
              exercise.description,
              exercise.muscle_groups,
              exercise.equipment,
              exercise.video_url,
              exercise.is_ai_generated,
            ],
          );
          const rows = result.rows as { id: number }[];
          ids.push(rows[0].id);
        }
        await fetchExercises();
        return ids;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to add exercises',
        );
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchExercises],
  );

  return {
    exercises,
    loading,
    error,
    fetchExercises,
    getExerciseById,
    addExercise,
    addExercisesBatch,
    updateExercise,
    deleteExercise,
    searchExercises,
  };
}
