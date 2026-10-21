/**
 * Dashboard Query module: the small reads the Dashboard (and the hooks it
 * used to call imperatively) share. Each takes a DB so React Query hooks and
 * the older stateful hooks run the same SQL.
 */

import type {
  FoodEntry,
  ProgramExerciseWithDetails,
  ProgramSession,
  WeightLog,
  WorkoutLog,
  WorkoutProgram,
  WorkoutProgramWithSessions,
  WorkoutStatus,
} from '../../types';
import { formatDate } from '../../utils/date';
import { pgDate } from '../../utils/pgValues';
import type { Queryable as DB } from '../db';
import { findResumable } from './activeWorkout';

export async function foodEntriesForDate(
  db: DB,
  date: string,
): Promise<FoodEntry[]> {
  const result = await db.query<FoodEntry>(
    'SELECT * FROM food_entries WHERE date = $1 ORDER BY created_at',
    [date],
  );
  return result.rows;
}

export async function latestWeightLog(db: DB): Promise<WeightLog | null> {
  const result = await db.query<WeightLog>(
    'SELECT * FROM weight_logs ORDER BY date DESC LIMIT 1',
  );
  return result.rows[0] ?? null;
}

export async function firstWeight(db: DB): Promise<number | null> {
  const result = await db.query<{ weight_kg: number }>(
    'SELECT weight_kg FROM weight_logs ORDER BY date ASC LIMIT 1',
  );
  return result.rows[0]?.weight_kg ?? null;
}

/**
 * The active Program with its Sessions and their Program Exercises, in three
 * round-trips (was one exercises query per Session).
 */
export async function activeProgram(
  db: DB,
): Promise<WorkoutProgramWithSessions | null> {
  const programResult = await db.query<WorkoutProgram>(
    'SELECT * FROM workout_programs WHERE is_active = true LIMIT 1',
  );
  const program = programResult.rows[0];
  if (!program) return null;

  const sessionsResult = await db.query<ProgramSession>(
    'SELECT * FROM program_sessions WHERE program_id = $1 ORDER BY order_index',
    [program.id],
  );
  const exercisesResult = await db.query<ProgramExerciseWithDetails>(
    `SELECT pe.*, e.name as exercise_name, e.description as exercise_description,
            e.muscle_groups, e.equipment, e.exercise_type
     FROM program_exercises pe
     JOIN exercises e ON pe.exercise_id = e.id
     JOIN program_sessions ps ON ps.id = pe.session_id
     WHERE ps.program_id = $1
     ORDER BY pe.session_id, pe.order_index`,
    [program.id],
  );
  const bySession = new Map<number, ProgramExerciseWithDetails[]>();
  for (const row of exercisesResult.rows) {
    const list = bySession.get(row.session_id) ?? [];
    list.push(row);
    bySession.set(row.session_id, list);
  }

  return {
    ...program,
    sessions: sessionsResult.rows.map((session) => ({
      ...session,
      exercises: bySession.get(session.id) ?? [],
    })),
  };
}

export interface SessionStatus {
  hasWorkout: boolean;
  status: WorkoutStatus | null;
  workoutId: number | null;
}

/** The latest Workout Log of a Session on a date (YYYY-MM-DD). */
export async function sessionStatusForDate(
  db: DB,
  sessionId: number,
  date: string,
): Promise<SessionStatus> {
  const result = await db.query<{
    id: number;
    status: WorkoutStatus | null;
    ended_at: string | null;
  }>(
    `SELECT id, status, ended_at FROM workout_logs
     WHERE session_id = $1 AND date = $2
     ORDER BY started_at DESC
     LIMIT 1`,
    [sessionId, date],
  );
  const log = result.rows[0];
  if (!log) return { hasWorkout: false, status: null, workoutId: null };

  // Legacy rows may carry a NULL status: infer it from ended_at.
  const status = log.status ?? (log.ended_at ? 'completed' : 'in_progress');
  return { hasWorkout: true, status, workoutId: log.id };
}

/**
 * The Workout Log to resume, if any. A legacy row with a NULL status is
 * normalised to 'in_progress' on the way (as resumeWorkout always did).
 */
export async function resumableWorkout(
  db: DB,
  opts: { preferDate?: string } = {},
): Promise<WorkoutLog | null> {
  const workout = await findResumable(db, opts);
  if (!workout) return null;
  if (!workout.status) {
    await db.query(
      `UPDATE workout_logs SET status = 'in_progress' WHERE id = $1`,
      [workout.id],
    );
    workout.status = 'in_progress';
  }
  return workout;
}

// ---------------------------------------------------------------------------
// Weekly consistency (the Dashboard week strip)
// ---------------------------------------------------------------------------

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

/** Sunday..Saturday of the current week. */
export function currentWeek(): { start: Date; end: Date; dates: Date[] } {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay());
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d);
  }
  return { start, end, dates };
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** What was logged on each day of the current week. Empty days on error. */
export async function weeklyConsistency(
  db: DB,
): Promise<WeeklyConsistencyData> {
  const { start, end, dates } = currentWeek();
  const startStr = formatDate(start);
  const endStr = formatDate(end);
  const todayStr = formatDate(new Date());

  let weightDates = new Set<string>();
  let foodDates = new Set<string>();
  let workoutDates = new Set<string>();
  let scheduledDays = new Set<number>();

  try {
    const [weightResult, foodResult, workoutResult, scheduledResult] =
      await Promise.all([
        db.query<{ date: unknown }>(
          `SELECT DISTINCT date FROM weight_logs WHERE date >= $1 AND date <= $2`,
          [startStr, endStr],
        ),
        db.query<{ date: unknown }>(
          `SELECT DISTINCT date FROM food_entries WHERE date >= $1 AND date <= $2`,
          [startStr, endStr],
        ),
        db.query<{ date: unknown }>(
          `SELECT DISTINCT date FROM workout_logs
           WHERE date >= $1 AND date <= $2 AND status = 'completed'`,
          [startStr, endStr],
        ),
        db.query<{ day_of_week: number }>(
          `SELECT DISTINCT ps.day_of_week
           FROM program_sessions ps
           JOIN workout_programs wp ON ps.program_id = wp.id
           WHERE wp.is_active = true AND ps.day_of_week IS NOT NULL`,
        ),
      ]);
    const dateSet = (rows: { date: unknown }[]) =>
      new Set(rows.map((r) => pgDate(r.date)));
    weightDates = dateSet(weightResult.rows);
    foodDates = dateSet(foodResult.rows);
    workoutDates = dateSet(workoutResult.rows);
    scheduledDays = new Set(scheduledResult.rows.map((r) => r.day_of_week));
  } catch {
    // Render the week with nothing logged rather than no strip at all.
  }

  const days: DayConsistency[] = dates.map((date, index) => {
    const dateStr = formatDate(date);
    return {
      date: dateStr,
      dayOfWeek: index,
      dayLabel: DAY_LABELS[index],
      hasWeight: weightDates.has(dateStr),
      hasFood: foodDates.has(dateStr),
      hasWorkout: workoutDates.has(dateStr),
      isScheduledWorkoutDay: scheduledDays.has(index),
      isToday: dateStr === todayStr,
      isFuture: date > new Date(),
    };
  });

  return { days, weekStart: startStr, weekEnd: endStr };
}
