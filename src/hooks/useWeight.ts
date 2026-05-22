import { useCallback, useState } from 'react';
import { getDB } from '../services/db';
import type { WeightLog } from '../types';

export function useWeight() {
  const [logs, setLogs] = useState<WeightLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async (limit?: number) => {
    setLoading(true);
    setError(null);
    try {
      const db = await getDB();
      const query = limit
        ? `SELECT * FROM weight_logs ORDER BY date DESC LIMIT ${limit}`
        : 'SELECT * FROM weight_logs ORDER BY date DESC';
      const result = await db.query(query);
      setLogs(result.rows as WeightLog[]);
      return result.rows as WeightLog[];
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch weight logs',
      );
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLogsByDateRange = useCallback(
    async (startDate: string, endDate: string) => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        const result = await db.query(
          'SELECT * FROM weight_logs WHERE date >= $1 AND date <= $2 ORDER BY date',
          [startDate, endDate],
        );
        setLogs(result.rows as WeightLog[]);
        return result.rows as WeightLog[];
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to fetch weight logs',
        );
        return [];
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const addLog = useCallback(
    async (log: Omit<WeightLog, 'id' | 'created_at' | 'updated_at'>) => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        await db.query(
          `INSERT INTO weight_logs (date, weight_kg, waist_cm, neck_cm, arm_cm, body_fat_pct)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (date) DO UPDATE SET
           weight_kg = $2, waist_cm = $3, neck_cm = $4, arm_cm = $5, body_fat_pct = $6,
           updated_at = CURRENT_TIMESTAMP`,
          [
            log.date,
            log.weight_kg,
            log.waist_cm,
            log.neck_cm,
            log.arm_cm,
            log.body_fat_pct,
          ],
        );
        await fetchLogs();

      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to add weight log',
        );
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchLogs],
  );

  const updateLog = useCallback(
    async (id: number, data: Partial<WeightLog>) => {
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
          fields.push('updated_at = CURRENT_TIMESTAMP');
          values.push(id);
          await db.query(
            `UPDATE weight_logs SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
            values,
          );
          await fetchLogs();
  
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to update weight log',
        );
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchLogs],
  );

  const deleteLog = useCallback(
    async (id: number) => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        await db.query('DELETE FROM weight_logs WHERE id = $1', [id]);
        await fetchLogs();

      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to delete weight log',
        );
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchLogs],
  );

  const getLatestLog = useCallback(async (): Promise<WeightLog | null> => {
    try {
      const db = await getDB();
      const result = await db.query(
        'SELECT * FROM weight_logs ORDER BY date DESC LIMIT 1',
      );
      const rows = result.rows as WeightLog[];
      return rows.length > 0 ? rows[0] : null;
    } catch {
      return null;
    }
  }, []);

  const getRecentWeights = useCallback(async (limit = 7): Promise<number[]> => {
    try {
      const db = await getDB();
      const result = await db.query(
        'SELECT weight_kg FROM weight_logs ORDER BY date DESC LIMIT $1',
        [limit],
      );
      // Return in chronological order (oldest first) for sparkline
      return (result.rows as { weight_kg: number }[])
        .map((r) => r.weight_kg)
        .reverse();
    } catch {
      return [];
    }
  }, []);

  const getFirstWeight = useCallback(async (): Promise<number | null> => {
    try {
      const db = await getDB();
      const result = await db.query(
        'SELECT weight_kg FROM weight_logs ORDER BY date ASC LIMIT 1',
      );
      const rows = result.rows as { weight_kg: number }[];
      return rows.length > 0 ? rows[0].weight_kg : null;
    } catch {
      return null;
    }
  }, []);

  return {
    logs,
    loading,
    error,
    fetchLogs,
    fetchLogsByDateRange,
    addLog,
    updateLog,
    deleteLog,
    getLatestLog,
    getRecentWeights,
    getFirstWeight,
  };
}
