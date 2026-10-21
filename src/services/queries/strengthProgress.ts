/**
 * Strength progress Query module: the Progress page's per-Exercise summary
 * and the Dashboard's overview / recent Personal Records.
 *
 * `exercisesProgress` used to issue six queries per Exercise (best set, trend,
 * four PRs): ~1,500 round-trips for a 250-Exercise library. It is now one
 * set-based query: the completed Sets of the listed Exercises are read once
 * and aggregated per Workout Log, then per Exercise.
 */

import { startOfWeek } from 'date-fns';
import type {
  ExerciseProgressSummary,
  ExerciseType,
  OverallProgressMetrics,
  PersonalRecord,
  ProgressTrend,
} from '../../types';
import { formatDate, getLocalDateString } from '../../utils/date';
import { pgDate } from '../../utils/pgValues';
import type { Queryable as DB } from '../db';

export type TimeRange = '7d' | '30d' | '90d' | 'all';

// Epley formula: 1RM = weight * (1 + reps / 30)
// Industry-standard estimate, most accurate in the 1-10 rep range.
// Returns null for invalid inputs (zero weight or reps).
export function calculateEstimated1RM(
  weight: number,
  reps: number,
): number | null {
  if (weight <= 0 || reps <= 0) return null;
  if (reps === 1) return weight;
  // kg, unrounded: the UI rounds after converting to the display unit.
  return weight * (1 + reps / 30);
}

// Converts a UI time range filter into SQL-ready date strings.
// "7d" aligns to the current week start (Sunday) for consistency with the
// weekly view. "30d" and "90d" use rolling windows. "all" returns null
// startDate, which callers handle with conditional SQL (PGlite can't optimize
// WHERE ($1 IS NULL OR date >= $1) into an index scan).
export function getDateRange(range: TimeRange): {
  startDate: string | null;
  endDate: string;
} {
  const endDate = getLocalDateString();
  if (range === 'all') {
    return { startDate: null, endDate };
  }

  if (range === '7d') {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
    return { startDate: formatDate(weekStart), endDate };
  }

  const days = range === '30d' ? 30 : 90;
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startDate = formatDate(start);

  return { startDate, endDate };
}

// Compares the average estimated 1RM of the last 4 sessions against the
// preceding 4 sessions. A >5% increase = "progressing", >5% decrease =
// "regressing", otherwise "plateau". Requires at least 6 sessions (4 recent
// + 2 older) for a meaningful comparison; defaults to "plateau" with less data.
// The 5% threshold filters out normal session-to-session noise.
// `sessionMax1RMs`: per-session max estimated 1RM, newest first, at most 8.
export function trendFromSessions(sessionMax1RMs: number[]): ProgressTrend {
  if (sessionMax1RMs.length < 4) return 'plateau';

  const recent = sessionMax1RMs.slice(0, 4);
  const older = sessionMax1RMs.slice(4, 8);

  if (older.length < 2) return 'plateau';

  const recentAvg = recent.reduce((sum, v) => sum + v, 0) / recent.length;
  const olderAvg = older.reduce((sum, v) => sum + v, 0) / older.length;

  const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;

  if (changePercent > 5) return 'progressing';
  if (changePercent < -5) return 'regressing';
  return 'plateau';
}

// Same expression the per-Exercise queries always used (REAL * float8).
const E1RM = 'ws.weight_kg * (1 + ws.reps::float / 30)';

interface ExerciseProgressRow {
  exercise_id: number;
  exercise_name: string;
  muscle_groups: string;
  exercise_type: ExerciseType;
  last_performed: unknown;
  total_sessions: number;
  best_weight: number | null;
  best_reps: number | null;
  best_1rm: number | null;
  best_date: unknown;
  mw_value: number | null;
  mw_reps: number | null;
  mw_date: unknown;
  mr_value: number | null;
  mr_weight: number | null;
  mr_date: unknown;
  mv_value: number | null;
  mv_date: unknown;
  trend_1rms: number[] | null;
}

/**
 * Every Exercise performed in `range` (completed Workout Logs), with its
 * all-time best set, trend and Personal Records. One round-trip.
 */
export async function exercisesProgress(
  db: DB,
  range: TimeRange,
): Promise<ExerciseProgressSummary[]> {
  const { startDate, endDate } = getDateRange(range);
  const inRange = startDate ? 'date >= $1 AND date <= $2' : 'date <= $1';

  const result = await db.query<ExerciseProgressRow>(
    `WITH
     -- One row per (Exercise, completed Workout Log), all time: the range
     -- only picks which Exercises are listed; PRs and the trend ignore it.
     -- Each "best set" is an argmax packed into a float8[] (sort key first,
     -- then date and log id as the tie-break), so MAX() finds it in one hash
     -- aggregate instead of a sort per PR.
     per_log AS (
       SELECT ws.exercise_id, wl.id AS log_id, wl.date,
              MAX(ARRAY[${E1RM}, (wl.date - DATE '1970-01-01'), wl.id,
                        ws.weight_kg, ws.reps]::float8[])
                FILTER (WHERE ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL) AS best,
              MAX(ARRAY[ws.weight_kg, (wl.date - DATE '1970-01-01'), wl.id,
                        ws.reps]::float8[])
                FILTER (WHERE ws.weight_kg IS NOT NULL) AS mw,
              MAX(ARRAY[ws.reps, (wl.date - DATE '1970-01-01'), wl.id,
                        ws.weight_kg]::float8[])
                FILTER (WHERE ws.reps IS NOT NULL AND ws.weight_kg > 0) AS mr,
              SUM(ws.weight_kg * ws.reps)
                FILTER (WHERE ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL) AS volume,
              MAX(${E1RM})
                FILTER (WHERE ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL) AS max_1rm
       FROM workout_sets ws
       JOIN workout_logs wl ON ws.workout_log_id = wl.id
       WHERE wl.status = 'completed'
       GROUP BY ws.exercise_id, wl.id, wl.date
     ),
     per_exercise AS (
       SELECT exercise_id,
              MAX(date) FILTER (WHERE ${inRange}) AS last_performed,
              COUNT(*) FILTER (WHERE ${inRange}) AS total_sessions,
              MAX(best) AS best, MAX(mw) AS mw, MAX(mr) AS mr,
              MAX(ARRAY[volume, (date - DATE '1970-01-01'), log_id]::float8[])
                FILTER (WHERE volume IS NOT NULL) AS mv,
              (array_agg(max_1rm ORDER BY date DESC, log_id DESC)
                FILTER (WHERE max_1rm IS NOT NULL))[1:8] AS trend_1rms
       FROM per_log
       GROUP BY exercise_id
       HAVING COUNT(*) FILTER (WHERE ${inRange}) > 0
     )
     -- REAL columns went through float8 exactly; cast back so values print
     -- (and parse) as the REAL they are.
     SELECT e.id AS exercise_id, e.name AS exercise_name, e.muscle_groups,
            e.exercise_type, p.last_performed, p.total_sessions,
            p.best[4]::real AS best_weight, p.best[5]::int AS best_reps,
            p.best[1] AS best_1rm, DATE '1970-01-01' + p.best[2]::int AS best_date,
            p.mw[1]::real AS mw_value, p.mw[4]::int AS mw_reps,
            DATE '1970-01-01' + p.mw[2]::int AS mw_date,
            p.mr[1]::int AS mr_value, p.mr[4]::real AS mr_weight,
            DATE '1970-01-01' + p.mr[2]::int AS mr_date,
            p.mv[1]::real AS mv_value, DATE '1970-01-01' + p.mv[2]::int AS mv_date,
            p.trend_1rms
     FROM per_exercise p
     JOIN exercises e ON e.id = p.exercise_id
     ORDER BY p.last_performed DESC, e.id`,
    startDate ? [startDate, endDate] : [endDate],
  );

  return result.rows.map((row) => {
    const isDurationOnly =
      row.exercise_type === 'duration' || row.exercise_type === 'reps_only';
    const hasBest = row.best_weight != null && row.best_reps != null;

    return {
      exerciseId: row.exercise_id,
      exerciseName: row.exercise_name,
      muscleGroups: row.muscle_groups,
      exerciseType: row.exercise_type,
      trend: isDurationOnly
        ? 'plateau'
        : trendFromSessions(row.trend_1rms ?? []),
      lastPerformed: row.last_performed ? pgDate(row.last_performed) : null,
      estimated1RM:
        !isDurationOnly && hasBest
          ? calculateEstimated1RM(
              row.best_weight as number,
              row.best_reps as number,
            )
          : null,
      totalSessions: Number(row.total_sessions),
      prs: {
        maxWeight:
          row.mw_value != null
            ? {
                value: row.mw_value,
                reps: row.mw_reps,
                date: pgDate(row.mw_date),
              }
            : null,
        maxReps:
          row.mr_value != null
            ? {
                value: row.mr_value,
                weight: row.mr_weight as number,
                date: pgDate(row.mr_date),
              }
            : null,
        maxVolume:
          row.mv_value != null
            ? { value: Math.round(row.mv_value), date: pgDate(row.mv_date) }
            : null,
        max1RM:
          row.best_1rm != null
            ? { value: Math.round(row.best_1rm), date: pgDate(row.best_date) }
            : null,
      },
    };
  });
}

/**
 * New Personal Records since `since` (YYYY-MM-DD): Exercises whose max weight
 * or Estimated 1RM on/after `since` beats their max before it. One scan of
 * the history of the Exercises trained since then, split by MAX() FILTER.
 */
export async function recentPersonalRecords(
  db: DB,
  since: string,
): Promise<PersonalRecord[]> {
  const result = await db.query<{
    exercise_id: number;
    exercise_name: string;
    max_weight: number;
    max_1rm: number;
    is_weight_pr: boolean;
    is_1rm_pr: boolean;
  }>(
    `WITH maxes AS (
       SELECT e.id AS exercise_id, e.name AS exercise_name,
              MAX(ws.weight_kg) FILTER (WHERE wl.date >= $1) AS max_weight,
              MAX(${E1RM}) FILTER (WHERE wl.date >= $1) AS max_1rm,
              MAX(ws.weight_kg) FILTER (WHERE wl.date < $1) AS prev_weight,
              MAX(${E1RM}) FILTER (WHERE wl.date < $1) AS prev_1rm
       FROM workout_sets ws
       JOIN workout_logs wl ON ws.workout_log_id = wl.id
       JOIN exercises e ON ws.exercise_id = e.id
       WHERE wl.status = 'completed'
         AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL
         AND ws.exercise_id IN (
           SELECT ws2.exercise_id FROM workout_sets ws2
           JOIN workout_logs wl2 ON ws2.workout_log_id = wl2.id
           WHERE wl2.date >= $1 AND wl2.status = 'completed'
         )
       GROUP BY e.id, e.name
     )
     SELECT exercise_id, exercise_name, max_weight, max_1rm,
            max_weight > COALESCE(prev_weight, 0) AS is_weight_pr,
            max_1rm > COALESCE(prev_1rm, 0) AS is_1rm_pr
     FROM maxes
     WHERE max_weight > COALESCE(prev_weight, 0)
        OR max_1rm > COALESCE(prev_1rm, 0)
     ORDER BY exercise_id
     LIMIT 10`,
    [since],
  );

  const prs: PersonalRecord[] = [];
  for (const row of result.rows) {
    if (row.is_weight_pr) {
      prs.push({
        exerciseId: row.exercise_id,
        exerciseName: row.exercise_name,
        type: 'weight',
        value: row.max_weight,
        date: since,
      });
    }
    if (row.is_1rm_pr && !row.is_weight_pr) {
      prs.push({
        exerciseId: row.exercise_id,
        exerciseName: row.exercise_name,
        type: '1rm',
        value: row.max_1rm,
        date: since,
      });
    }
  }
  return prs.slice(0, 5);
}

/** Totals for `range` plus the last 7 days' Personal Records. */
export async function overallProgress(
  db: DB,
  range: TimeRange,
): Promise<OverallProgressMetrics> {
  const { startDate, endDate } = getDateRange(range);
  const where = startDate ? 'wl.date >= $1 AND wl.date <= $2' : 'wl.date <= $1';
  const params = startDate ? [startDate, endDate] : [endDate];

  const workoutResult = await db.query<{
    workout_count: number;
    total_minutes: number | null;
  }>(
    `SELECT
       COUNT(*) as workout_count,
       SUM(EXTRACT(EPOCH FROM (ended_at::timestamp - started_at::timestamp)) / 60) as total_minutes
     FROM workout_logs wl
     WHERE ${where} AND status = 'completed'`,
    params,
  );
  const workoutStats = workoutResult.rows[0];

  const volumeResult = await db.query<{
    total_volume: number | null;
    unique_exercises: number;
  }>(
    `SELECT
       SUM(ws.weight_kg * ws.reps) as total_volume,
       COUNT(DISTINCT ws.exercise_id) as unique_exercises
     FROM workout_sets ws
     JOIN workout_logs wl ON ws.workout_log_id = wl.id
     WHERE ${where} AND wl.status = 'completed'
     AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL`,
    params,
  );
  const volumeStats = volumeResult.rows[0];

  let volumeChange = 0;
  if (startDate && range !== 'all') {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const prevStart = new Date(startDate);
    prevStart.setDate(prevStart.getDate() - days);
    const prevStartDate = prevStart.toISOString().split('T')[0];

    const prevVolumeResult = await db.query<{ total_volume: number | null }>(
      `SELECT SUM(ws.weight_kg * ws.reps) as total_volume
       FROM workout_sets ws
       JOIN workout_logs wl ON ws.workout_log_id = wl.id
       WHERE wl.date >= $1 AND wl.date < $2 AND wl.status = 'completed'
       AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL`,
      [prevStartDate, startDate],
    );
    const prevVolume = prevVolumeResult.rows[0].total_volume;

    if (prevVolume && prevVolume > 0 && volumeStats.total_volume) {
      volumeChange =
        ((volumeStats.total_volume - prevVolume) / prevVolume) * 100;
    }
  }

  // Recent PRs: last 7 days regardless of the range filter.
  const prSince = new Date();
  prSince.setDate(prSince.getDate() - 7);
  let recentPRs: PersonalRecord[] = [];
  try {
    recentPRs = await recentPersonalRecords(
      db,
      prSince.toISOString().split('T')[0],
    );
  } catch {
    // PRs are a garnish; the totals still render.
  }

  return {
    totalVolume: Math.round(volumeStats.total_volume || 0),
    totalWorkouts: Number(workoutStats.workout_count) || 0,
    totalTimeMinutes: Math.round(workoutStats.total_minutes || 0),
    uniqueExercises: Number(volumeStats.unique_exercises) || 0,
    volumeChange: Math.round(volumeChange * 10) / 10,
    recentPRs,
  };
}
