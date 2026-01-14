import { useCallback } from 'react';
import { getDB } from '../services/db';
import { formatDate } from '../utils/date';

export interface DayConsistency {
  date: string;
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  dayLabel: string;
  hasWeight: boolean;
  hasFood: boolean;
  hasWorkout: boolean;
  isScheduledWorkoutDay: boolean; // true if active program has a session for this day
  isToday: boolean;
  isFuture: boolean;
}

export interface WeeklyConsistencyData {
  days: DayConsistency[];
  weekStart: string;
  weekEnd: string;
}

function getWeekDates(): { start: Date; end: Date; dates: Date[] } {
  const today = new Date();
  const currentDay = today.getDay(); // 0 = Sunday

  // Get Sunday of this week
  const start = new Date(today);
  start.setDate(today.getDate() - currentDay);
  start.setHours(0, 0, 0, 0);

  // Get Saturday of this week
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  // Generate all 7 dates
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d);
  }

  return { start, end, dates };
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function useWeeklyConsistency() {
  const getWeeklyConsistency =
    useCallback(async (): Promise<WeeklyConsistencyData> => {
      const { start, end, dates } = getWeekDates();
      const startStr = formatDate(start);
      const endStr = formatDate(end);
      const todayStr = formatDate(new Date());

      try {
        const db = await getDB();

        // Query all data sources in parallel, including active program's scheduled days
        const [weightResult, foodResult, workoutResult, activeProgramResult] =
          await Promise.all([
            // Weight logs for the week
            db.query(
              `SELECT DISTINCT date FROM weight_logs 
           WHERE date >= $1 AND date <= $2`,
              [startStr, endStr],
            ),
            // Food entries for the week
            db.query(
              `SELECT DISTINCT date FROM food_entries 
           WHERE date >= $1 AND date <= $2`,
              [startStr, endStr],
            ),
            // Completed workouts for the week
            db.query(
              `SELECT DISTINCT date FROM workout_logs 
           WHERE date >= $1 AND date <= $2 AND status = 'completed'`,
              [startStr, endStr],
            ),
            // Get scheduled workout days from active program
            db.query(
              `SELECT DISTINCT ps.day_of_week 
           FROM program_sessions ps
           JOIN workout_programs wp ON ps.program_id = wp.id
           WHERE wp.is_active = true AND ps.day_of_week IS NOT NULL`,
            ),
          ]);

        // Convert to sets for O(1) lookup
        const weightDates = new Set(
          (weightResult.rows as { date: string }[]).map((r) =>
            formatDate(r.date),
          ),
        );
        const foodDates = new Set(
          (foodResult.rows as { date: string }[]).map((r) =>
            formatDate(r.date),
          ),
        );
        const workoutDates = new Set(
          (workoutResult.rows as { date: string }[]).map((r) =>
            formatDate(r.date),
          ),
        );

        // Set of days of week (0-6) that have scheduled workouts
        const scheduledWorkoutDays = new Set(
          (activeProgramResult.rows as { day_of_week: number }[]).map(
            (r) => r.day_of_week,
          ),
        );

        // Build the days array
        const days: DayConsistency[] = dates.map((date, index) => {
          const dateStr = formatDate(date);
          return {
            date: dateStr,
            dayOfWeek: index,
            dayLabel: DAY_LABELS[index],
            hasWeight: weightDates.has(dateStr),
            hasFood: foodDates.has(dateStr),
            hasWorkout: workoutDates.has(dateStr),
            isScheduledWorkoutDay: scheduledWorkoutDays.has(index),
            isToday: dateStr === todayStr,
            isFuture: date > new Date(),
          };
        });

        return {
          days,
          weekStart: startStr,
          weekEnd: endStr,
        };
      } catch {
        // Return empty data on error
        const days: DayConsistency[] = dates.map((date, index) => {
          const dateStr = formatDate(date);
          return {
            date: dateStr,
            dayOfWeek: index,
            dayLabel: DAY_LABELS[index],
            hasWeight: false,
            hasFood: false,
            hasWorkout: false,
            isScheduledWorkoutDay: false,
            isToday: dateStr === todayStr,
            isFuture: date > new Date(),
          };
        });

        return {
          days,
          weekStart: startStr,
          weekEnd: endStr,
        };
      }
    }, []);

  return { getWeeklyConsistency };
}
