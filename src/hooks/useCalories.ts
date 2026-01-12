import { useState, useCallback } from 'react';
import { getDB } from '../services/db';
import type { FoodEntry, MealType, DailyCalorieSummary } from '../types';
import { formatDate, getPreviousDay } from '../utils/date';

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

  const addEntriesBatch = useCallback(
    async (
      entriesToAdd: Omit<FoodEntry, 'id' | 'created_at' | 'updated_at'>[],
    ) => {
      if (entriesToAdd.length === 0) return;

      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        for (const entry of entriesToAdd) {
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
        }
        // Refresh entries for the target date
        await fetchEntriesByDate(entriesToAdd[0].date);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add entries');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchEntriesByDate],
  );

  const copyMealsFromDate = useCallback(
    async (sourceDate: string, targetDate: string) => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        // Fetch entries from source date
        const result = await db.query(
          'SELECT * FROM food_entries WHERE date = $1',
          [sourceDate],
        );
        const sourceEntries = result.rows as FoodEntry[];

        if (sourceEntries.length === 0) {
          throw new Error('No meals found on the source date');
        }

        // Insert entries with new date
        for (const entry of sourceEntries) {
          await db.query(
            `INSERT INTO food_entries (date, meal_type, food_description, portion_grams, calories, protein_g, carbs_g, fat_g, is_ai_generated)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              targetDate,
              entry.meal_type,
              entry.food_description,
              entry.portion_grams,
              entry.calories,
              entry.protein_g,
              entry.carbs_g,
              entry.fat_g,
              false, // Mark as not AI generated since it's a copy
            ],
          );
        }

        await fetchEntriesByDate(targetDate);
        return sourceEntries.length;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to copy meals';
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [fetchEntriesByDate],
  );

  const copyMealsFromPreviousDay = useCallback(
    async (targetDate: string) => {
      const previousDate = getPreviousDay(targetDate);
      return copyMealsFromDate(previousDate, targetDate);
    },
    [copyMealsFromDate],
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

  const getLoggingStreak = useCallback(async (): Promise<number> => {
    try {
      const db = await getDB();
      // Get distinct dates with food entries, ordered by most recent
      const result = await db.query(
        `SELECT DISTINCT date FROM food_entries ORDER BY date DESC LIMIT 365`,
      );

      if (result.rows.length === 0) return 0;

      const loggedDates = new Set(
        (result.rows as { date: string }[]).map((r) => formatDate(r.date)),
      );

      let streak = 0;
      const today = new Date();

      // Check from today backwards
      for (let i = 0; i < 365; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() - i);
        const dateStr = formatDate(checkDate);

        if (loggedDates.has(dateStr)) {
          streak++;
        } else if (i === 0) {
          // If today has no entries, check if yesterday does (streak still valid)
          continue;
        } else {
          break;
        }
      }

      return streak;
    } catch {
      return 0;
    }
  }, []);

  const getRecentFoods = useCallback(
    async (
      limit = 5,
    ): Promise<
      Pick<
        FoodEntry,
        | 'food_description'
        | 'calories'
        | 'protein_g'
        | 'carbs_g'
        | 'fat_g'
        | 'portion_grams'
      >[]
    > => {
      try {
        const db = await getDB();
        // Get recent unique foods, prioritizing most frequently logged
        const result = await db.query(
          `SELECT 
          food_description,
          AVG(calories)::int as calories,
          AVG(protein_g)::numeric(10,1) as protein_g,
          AVG(carbs_g)::numeric(10,1) as carbs_g,
          AVG(fat_g)::numeric(10,1) as fat_g,
          AVG(portion_grams)::numeric(10,1) as portion_grams,
          COUNT(*) as frequency,
          MAX(created_at) as last_used
        FROM food_entries
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY food_description
        ORDER BY frequency DESC, last_used DESC
        LIMIT $1`,
          [limit],
        );

        return result.rows.map((row) => {
          const r = row as {
            food_description: string;
            calories: number;
            protein_g: number;
            carbs_g: number;
            fat_g: number;
            portion_grams: number;
          };
          return {
            food_description: r.food_description,
            calories: Number(r.calories),
            protein_g: Number(r.protein_g),
            carbs_g: Number(r.carbs_g),
            fat_g: Number(r.fat_g),
            portion_grams: Number(r.portion_grams),
          };
        });
      } catch {
        return [];
      }
    },
    [],
  );

  return {
    entries,
    loading,
    error,
    fetchEntriesByDate,
    fetchEntriesByDateRange,
    addEntry,
    addEntriesBatch,
    updateEntry,
    deleteEntry,
    getDailySummary,
    getTodaySummary,
    getLoggingStreak,
    getRecentFoods,
    copyMealsFromDate,
    copyMealsFromPreviousDay,
  };
}
