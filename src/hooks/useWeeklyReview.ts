import { useState, useCallback } from 'react';
import { getDB } from '../services/db';
import { formatDate, getWeekRange } from '../utils/date';
import { subDays, isMonday } from 'date-fns';
import type {
  WeeklyReviewData,
  WeeklyReviewSufficiency,
  WeeklyReview,
  WeightLog,
  FoodEntry,
  WorkoutLog,
  UserProfile,
} from '../types';

// Minimum requirements for a meaningful weekly review
const MIN_LOGGED_DAYS = 5; // At least 5 days with any logged data for assessment
const MIN_WEIGHT_DAYS = 2; // At least 2 weight logs for trend
const MIN_CALORIE_DAYS = 3; // At least 3 days of calorie logging

export function useWeeklyReview() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Check if today is Monday (review day)
   * Can be forced via URL query param ?forceReview=true for testing
   */
  const isReviewDay = useCallback((): boolean => {
    // Allow forcing review for testing
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('forceReview') === 'true') {
        return true;
      }
    }
    return isMonday(new Date());
  }, []);

  /**
   * Get the date range for the past week (Monday to Sunday)
   * If called on Monday, returns the previous week (Mon-Sun)
   */
  const getPastWeekRange = useCallback((): { start: string; end: string } => {
    const today = new Date();
    // On Monday, look back to get the completed week
    const referenceDate = isMonday(today) ? subDays(today, 1) : today;
    const range = getWeekRange(referenceDate);
    return {
      start: formatDate(range.start),
      end: formatDate(range.end),
    };
  }, []);

  /**
   * Fetch all data for the past week
   */
  const fetchWeeklyData = useCallback(
    async (profile: UserProfile): Promise<WeeklyReviewData | null> => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        const { start, end } = getPastWeekRange();

        // Fetch weight logs
        const weightResult = await db.query(
          'SELECT * FROM weight_logs WHERE date >= $1 AND date <= $2 ORDER BY date',
          [start, end],
        );
        const weightLogs = weightResult.rows as WeightLog[];

        // Fetch calorie entries
        const calorieResult = await db.query(
          'SELECT * FROM food_entries WHERE date >= $1 AND date <= $2 ORDER BY date',
          [start, end],
        );
        const calorieEntries = calorieResult.rows as FoodEntry[];

        // Fetch workout logs
        const workoutResult = await db.query(
          'SELECT * FROM workout_logs WHERE date >= $1 AND date <= $2 ORDER BY date',
          [start, end],
        );
        const workoutLogs = workoutResult.rows as WorkoutLog[];

        // Calculate unique days with data
        const weightDates = new Set(weightLogs.map((w) => formatDate(w.date)));
        const calorieDates = new Set(
          calorieEntries.map((c) => formatDate(c.date)),
        );
        const workoutDates = new Set(
          workoutLogs.map((w) => formatDate(w.date)),
        );

        // Calculate total unique days with any logged data
        const allDates = new Set([
          ...weightDates,
          ...calorieDates,
          ...workoutDates,
        ]);

        const weightDays = weightDates.size;
        const calorieDays = calorieDates.size;
        const workoutDays = workoutDates.size;
        const totalUniqueDaysLogged = allDates.size;

        // Calculate calorie stats
        const dailyCalories: Record<string, number> = {};
        calorieEntries.forEach((entry) => {
          const dateKey = formatDate(entry.date);
          dailyCalories[dateKey] =
            (dailyCalories[dateKey] || 0) + entry.calories;
        });
        const totalDays = Object.keys(dailyCalories).length;
        const avgDailyCalories =
          totalDays > 0
            ? Math.round(
                Object.values(dailyCalories).reduce((a, b) => a + b, 0) /
                  totalDays,
              )
            : 0;

        // Calculate calorie adherence
        const calorieAdherence =
          profile.calorie_target > 0 && avgDailyCalories > 0
            ? Math.round((avgDailyCalories / profile.calorie_target) * 100)
            : 0;

        // Weight change
        const startWeight =
          weightLogs.length > 0 ? weightLogs[0].weight_kg : null;
        const endWeight =
          weightLogs.length > 0
            ? weightLogs[weightLogs.length - 1].weight_kg
            : null;
        const weightChange =
          startWeight && endWeight
            ? Math.round((endWeight - startWeight) * 100) / 100
            : null;

        return {
          weekStart: start,
          weekEnd: end,
          weightLogs,
          calorieEntries,
          workoutLogs,
          daysWithWeightLog: weightDays,
          daysWithCalorieLog: calorieDays,
          daysWithWorkout: workoutDays,
          totalUniqueDaysLogged,
          avgDailyCalories,
          totalWorkouts: workoutLogs.length,
          startWeight,
          endWeight,
          weightChange,
          calorieAdherence,
        };
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to fetch weekly data',
        );
        return null;
      } finally {
        setLoading(false);
      }
    },
    [getPastWeekRange],
  );

  /**
   * Check if there's sufficient data for a meaningful review
   * Requires at least 5 total logged days (any combination of weight, calories, workouts)
   */
  const checkDataSufficiency = useCallback(
    (data: WeeklyReviewData | null): WeeklyReviewSufficiency => {
      if (!data) {
        return {
          hasSufficientData: false,
          hasWeightData: false,
          hasCalorieData: false,
          hasWorkoutData: false,
          weightDaysLogged: 0,
          calorieDaysLogged: 0,
          workoutDaysLogged: 0,
          totalDaysLogged: 0,
          minimumLoggedDays: MIN_LOGGED_DAYS,
          minimumWeightDays: MIN_WEIGHT_DAYS,
          minimumCalorieDays: MIN_CALORIE_DAYS,
        };
      }

      const hasWeightData = data.daysWithWeightLog >= MIN_WEIGHT_DAYS;
      const hasCalorieData = data.daysWithCalorieLog >= MIN_CALORIE_DAYS;
      const hasWorkoutData = data.daysWithWorkout > 0;

      // Sufficient only if we have at least 5 unique days with logged data
      const hasSufficientData = data.totalUniqueDaysLogged >= MIN_LOGGED_DAYS;

      return {
        hasSufficientData,
        hasWeightData,
        hasCalorieData,
        hasWorkoutData,
        weightDaysLogged: data.daysWithWeightLog,
        calorieDaysLogged: data.daysWithCalorieLog,
        workoutDaysLogged: data.daysWithWorkout,
        totalDaysLogged: data.totalUniqueDaysLogged,
        minimumLoggedDays: MIN_LOGGED_DAYS,
        minimumWeightDays: MIN_WEIGHT_DAYS,
        minimumCalorieDays: MIN_CALORIE_DAYS,
      };
    },
    [],
  );

  /**
   * Check if a review has already been completed for this week
   */
  const hasCompletedReviewThisWeek = useCallback(async (): Promise<boolean> => {
    try {
      const db = await getDB();
      const { start, end } = getPastWeekRange();
      const result = await db.query(
        'SELECT id FROM weekly_reviews WHERE week_start = $1 AND week_end = $2',
        [start, end],
      );
      return (result.rows as { id: number }[]).length > 0;
    } catch {
      return false;
    }
  }, [getPastWeekRange]);

  /**
   * Save a completed weekly review
   */
  const saveWeeklyReview = useCallback(
    async (
      data: WeeklyReviewData,
      profile: UserProfile,
      aiSummary: string,
      recommendationsApplied: Record<string, boolean>,
      newGoal?: string | null,
      newCalorieTarget?: number | null,
    ): Promise<void> => {
      try {
        const db = await getDB();
        await db.query(
          `INSERT INTO weekly_reviews (
            week_start, week_end, start_weight, end_weight, weight_change,
            avg_daily_calories, calorie_target, calorie_adherence, workouts_completed,
            previous_goal, new_goal, previous_calorie_target, new_calorie_target,
            ai_summary, recommendations_applied
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            data.weekStart,
            data.weekEnd,
            data.startWeight,
            data.endWeight,
            data.weightChange,
            data.avgDailyCalories,
            profile.calorie_target,
            data.calorieAdherence,
            data.totalWorkouts,
            profile.goal,
            newGoal || null,
            profile.calorie_target,
            newCalorieTarget || null,
            aiSummary,
            JSON.stringify(recommendationsApplied),
          ],
        );
      } catch (err) {
        throw new Error(
          err instanceof Error ? err.message : 'Failed to save weekly review',
        );
      }
    },
    [],
  );

  /**
   * Get review history
   */
  const getReviewHistory = useCallback(
    async (limit = 10): Promise<WeeklyReview[]> => {
      try {
        const db = await getDB();
        const result = await db.query(
          'SELECT * FROM weekly_reviews ORDER BY week_start DESC LIMIT $1',
          [limit],
        );
        return result.rows as WeeklyReview[];
      } catch {
        return [];
      }
    },
    [],
  );

  /**
   * Check if the weekly review button should be shown
   * Shows on Monday if there's at least 5 logged days and no review completed yet
   */
  const shouldShowReviewButton = useCallback(
    async (
      profile: UserProfile | null,
    ): Promise<{
      show: boolean;
      reason: string;
      sufficiency: WeeklyReviewSufficiency | null;
    }> => {
      // Must have a profile
      if (!profile) {
        return { show: false, reason: 'No profile', sufficiency: null };
      }

      // Check if today is Monday (review day)
      if (!isReviewDay()) {
        return { show: false, reason: 'Not review day', sufficiency: null };
      }

      // Check if already completed this week
      const alreadyCompleted = await hasCompletedReviewThisWeek();
      if (alreadyCompleted) {
        return {
          show: false,
          reason: 'Review already completed',
          sufficiency: null,
        };
      }

      // Fetch and check data sufficiency
      const weeklyData = await fetchWeeklyData(profile);
      const sufficiency = checkDataSufficiency(weeklyData);

      if (!sufficiency.hasSufficientData) {
        return {
          show: false,
          reason: 'Insufficient data',
          sufficiency,
        };
      }

      return { show: true, reason: 'Ready for review', sufficiency };
    },
    [
      isReviewDay,
      hasCompletedReviewThisWeek,
      fetchWeeklyData,
      checkDataSufficiency,
    ],
  );

  return {
    loading,
    error,
    isReviewDay,
    getPastWeekRange,
    fetchWeeklyData,
    checkDataSufficiency,
    hasCompletedReviewThisWeek,
    saveWeeklyReview,
    getReviewHistory,
    shouldShowReviewButton,
  };
}
