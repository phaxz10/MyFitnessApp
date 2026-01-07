import { useState, useCallback } from 'react';
import { getDB } from '../services/db';
import type { FoodEntry, MealType, DailyCalorieSummary } from '../types';
import { formatDate } from '../utils/date';

export function useCalories() {
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEntriesByDate = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const db = await getDB();
      const result = await db.query(
        'SELECT * FROM food_entries WHERE date = $1 ORDER BY created_at',
        [date],
      );
      setEntries(result.rows as FoodEntry[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch entries');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEntriesByDateRange = useCallback(
    async (startDate: string, endDate: string) => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        const result = await db.query(
          'SELECT * FROM food_entries WHERE date >= $1 AND date <= $2 ORDER BY date, created_at',
          [startDate, endDate],
        );
        setEntries(result.rows as FoodEntry[]);
        return result.rows as FoodEntry[];
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to fetch entries',
        );
        return [];
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const addEntry = useCallback(
    async (entry: Omit<FoodEntry, 'id' | 'created_at' | 'updated_at'>) => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        await db.query(
          `INSERT INTO food_entries (date, meal_type, food_description, portion_grams, calories, protein_g, carbs_g, fat_g, is_ai_generated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            entry.date,
            entry.meal_type,
            entry.food_description,
            entry.portion_grams,
            entry.calories,
            entry.protein_g,
            entry.carbs_g,
            entry.fat_g,
            entry.is_ai_generated,
          ],
        );
        await fetchEntriesByDate(entry.date);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add entry');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchEntriesByDate],
  );

  const updateEntry = useCallback(
    async (id: number, data: Partial<FoodEntry>) => {
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
            `UPDATE food_entries SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
            values,
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update entry');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const deleteEntry = useCallback(
    async (id: number, date: string) => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        await db.query('DELETE FROM food_entries WHERE id = $1', [id]);
        await fetchEntriesByDate(date);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete entry');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchEntriesByDate],
  );

  const getDailySummary = useCallback(
    (date: string, entriesList?: FoodEntry[]): DailyCalorieSummary => {
      const dayEntries = (entriesList || entries).filter(
        (e) => formatDate(e.date) === date,
      );

      const meals: Record<MealType, FoodEntry[]> = {
        breakfast: [],
        lunch: [],
        dinner: [],
        snack: [],
      };

      let totalCalories = 0;
      let totalProtein = 0;
      let totalCarbs = 0;
      let totalFat = 0;

      dayEntries.forEach((entry) => {
        meals[entry.meal_type].push(entry);
        totalCalories += entry.calories;
        totalProtein += entry.protein_g;
        totalCarbs += entry.carbs_g;
        totalFat += entry.fat_g;
      });

      return {
        date,
        total_calories: totalCalories,
        total_protein_g: totalProtein,
        total_carbs_g: totalCarbs,
        total_fat_g: totalFat,
        meals,
      };
    },
    [entries],
  );

  const getTodaySummary = useCallback(() => {
    return getDailySummary(formatDate(new Date()));
  }, [getDailySummary]);

  return {
    entries,
    loading,
    error,
    fetchEntriesByDate,
    fetchEntriesByDateRange,
    addEntry,
    updateEntry,
    deleteEntry,
    getDailySummary,
    getTodaySummary,
  };
}
