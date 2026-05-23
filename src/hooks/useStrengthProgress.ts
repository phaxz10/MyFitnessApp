import { useQuery } from '@tanstack/react-query';
import { startOfWeek } from 'date-fns';
import { getDB } from '../services/db';
import type {
  ExercisePR,
  ExerciseProgressSummary,
  ExerciseSessionData,
  ExerciseType,
  OverallProgressMetrics,
  PersonalRecord,
  ProgressTrend,
  VolumeChartData,
} from '../types';
import { formatDate, getLocalDateString } from '../utils/date';

// Type for TimeRange
export type TimeRange = '7d' | '30d' | '90d' | 'all';

// Type for muscle group breakdown
export interface MuscleGroupBreakdown {
  muscleGroup: string;
  setsCompleted: number;
  totalVolume: number;
  exerciseCount: number;
  percentOfTotal: number;
}

export interface WeeklyMuscleStats {
  weekStart: string;
  weekEnd: string;
  breakdown: MuscleGroupBreakdown[];
  totalSets: number;
  totalVolume: number;
}

// Query keys
export const strengthProgressKeys = {
  all: ['strengthProgress'] as const,
  overview: (range: TimeRange) =>
    [...strengthProgressKeys.all, 'overview', range] as const,
  volumeChart: (range: TimeRange) =>
    [...strengthProgressKeys.all, 'volumeChart', range] as const,
  exercises: (range: TimeRange) =>
    [...strengthProgressKeys.all, 'exercises', range] as const,
  weeklyMuscles: () => [...strengthProgressKeys.all, 'weeklyMuscles'] as const,
  exerciseDetail: (exerciseId: number, range: TimeRange) =>
    [...strengthProgressKeys.all, 'exerciseDetail', exerciseId, range] as const,
  exercisePRs: (exerciseId: number) =>
    [...strengthProgressKeys.all, 'exercisePRs', exerciseId] as const,
};

// Epley formula: 1RM = weight * (1 + reps / 30)
// Industry-standard estimate, most accurate in the 1-10 rep range.
// Returns null for invalid inputs (zero weight or reps).
export function calculateEstimated1RM(
  weight: number,
  reps: number,
): number | null {
  if (weight <= 0 || reps <= 0) return null;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

// Converts a UI time range filter into SQL-ready date strings.
// "7d" aligns to the current week start (Sunday) for consistency with the
// weekly view. "30d" and "90d" use rolling windows. "all" returns null
// startDate, which callers handle with conditional SQL (PGlite can't optimize
// WHERE ($1 IS NULL OR date >= $1) into an index scan).
function getDateRange(range: TimeRange): {
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

// Get PRs for a specific exercise
async function fetchExercisePRs(exerciseId: number): Promise<ExercisePR> {
  try {
    const db = await getDB();

    const maxWeightResult = await db.query(
      `SELECT ws.weight_kg as value, ws.reps, wl.date
       FROM workout_sets ws
       JOIN workout_logs wl ON ws.workout_log_id = wl.id
       WHERE ws.exercise_id = $1 AND wl.status = 'completed'
       AND ws.weight_kg IS NOT NULL
       ORDER BY ws.weight_kg DESC
       LIMIT 1`,
      [exerciseId],
    );

    const maxRepsResult = await db.query(
      `SELECT ws.reps as value, ws.weight_kg as weight, wl.date
       FROM workout_sets ws
       JOIN workout_logs wl ON ws.workout_log_id = wl.id
       WHERE ws.exercise_id = $1 AND wl.status = 'completed'
       AND ws.reps IS NOT NULL AND ws.weight_kg > 0
       ORDER BY ws.reps DESC
       LIMIT 1`,
      [exerciseId],
    );

    const maxVolumeResult = await db.query(
      `SELECT SUM(ws.weight_kg * ws.reps) as value, wl.date
       FROM workout_sets ws
       JOIN workout_logs wl ON ws.workout_log_id = wl.id
       WHERE ws.exercise_id = $1 AND wl.status = 'completed'
       AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL
       GROUP BY wl.id, wl.date
       ORDER BY value DESC
       LIMIT 1`,
      [exerciseId],
    );

    const max1RMResult = await db.query(
      `SELECT ws.weight_kg * (1 + ws.reps::float / 30) as value, wl.date
       FROM workout_sets ws
       JOIN workout_logs wl ON ws.workout_log_id = wl.id
       WHERE ws.exercise_id = $1 AND wl.status = 'completed'
       AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL
       ORDER BY value DESC
       LIMIT 1`,
      [exerciseId],
    );

    return {
      maxWeight:
        maxWeightResult.rows.length > 0
          ? {
              value: (maxWeightResult.rows[0] as { value: number }).value,
              reps: (maxWeightResult.rows[0] as { reps: number }).reps,
              date: (maxWeightResult.rows[0] as { date: string }).date,
            }
          : null,
      maxReps:
        maxRepsResult.rows.length > 0
          ? {
              value: (maxRepsResult.rows[0] as { value: number }).value,
              weight: (maxRepsResult.rows[0] as { weight: number }).weight,
              date: (maxRepsResult.rows[0] as { date: string }).date,
            }
          : null,
      maxVolume:
        maxVolumeResult.rows.length > 0
          ? {
              value: Math.round(
                (maxVolumeResult.rows[0] as { value: number }).value,
              ),
              date: (maxVolumeResult.rows[0] as { date: string }).date,
            }
          : null,
      max1RM:
        max1RMResult.rows.length > 0
          ? {
              value: Math.round(
                (max1RMResult.rows[0] as { value: number }).value,
              ),
              date: (max1RMResult.rows[0] as { date: string }).date,
            }
          : null,
    };
  } catch {
    return {
      maxWeight: null,
      maxReps: null,
      maxVolume: null,
      max1RM: null,
    };
  }
}

// Compares the average estimated 1RM of the last 4 sessions against the
// preceding 4 sessions. A >5% increase = "progressing", >5% decrease =
// "regressing", otherwise "plateau". Requires at least 6 sessions (4 recent
// + 2 older) for a meaningful comparison; defaults to "plateau" with less data.
// The 5% threshold filters out normal session-to-session noise.
async function fetchExerciseTrend(exerciseId: number): Promise<ProgressTrend> {
  try {
    const db = await getDB();

    const result = await db.query(
      `SELECT MAX(ws.weight_kg * (1 + ws.reps::float / 30)) as max_1rm, wl.date
       FROM workout_sets ws
       JOIN workout_logs wl ON ws.workout_log_id = wl.id
       WHERE ws.exercise_id = $1 AND wl.status = 'completed'
       AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL
       GROUP BY wl.id, wl.date
       ORDER BY wl.date DESC
       LIMIT 8`,
      [exerciseId],
    );

    const sessions = result.rows as { max_1rm: number; date: string }[];

    if (sessions.length < 4) return 'plateau';

    const recent = sessions.slice(0, 4);
    const older = sessions.slice(4, 8);

    if (older.length < 2) return 'plateau';

    const recentAvg =
      recent.reduce((sum, s) => sum + s.max_1rm, 0) / recent.length;
    const olderAvg =
      older.reduce((sum, s) => sum + s.max_1rm, 0) / older.length;

    const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;

    if (changePercent > 5) return 'progressing';
    if (changePercent < -5) return 'regressing';
    return 'plateau';
  } catch {
    return 'plateau';
  }
}

// Detects new personal records by comparing recent maxes (within `days`)
// against all-time maxes from before that window. Uses a CTE to compute
// both windows in a single query, then filters for exercises where the
// recent max exceeds the historical max (weight PR or estimated 1RM PR).
async function fetchRecentPersonalRecords(
  days: number,
): Promise<PersonalRecord[]> {
  try {
    const db = await getDB();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    const result = await db.query(
      `WITH recent_maxes AS (
        SELECT 
          e.id as exercise_id,
          e.name as exercise_name,
          MAX(ws.weight_kg) as max_weight,
          MAX(ws.reps) as max_reps,
          MAX(ws.weight_kg * (1 + ws.reps::float / 30)) as max_1rm
        FROM workout_sets ws
        JOIN workout_logs wl ON ws.workout_log_id = wl.id
        JOIN exercises e ON ws.exercise_id = e.id
        WHERE wl.date >= $1 AND wl.status = 'completed'
        AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL
        GROUP BY e.id, e.name
      ),
      all_time_maxes AS (
        SELECT 
          e.id as exercise_id,
          MAX(ws.weight_kg) as max_weight,
          MAX(ws.weight_kg * (1 + ws.reps::float / 30)) as max_1rm
        FROM workout_sets ws
        JOIN workout_logs wl ON ws.workout_log_id = wl.id
        JOIN exercises e ON ws.exercise_id = e.id
        WHERE wl.date < $1 AND wl.status = 'completed'
        AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL
        GROUP BY e.id
      )
      SELECT 
        r.exercise_id,
        r.exercise_name,
        r.max_weight,
        r.max_1rm,
        CASE WHEN r.max_weight > COALESCE(a.max_weight, 0) THEN true ELSE false END as is_weight_pr,
        CASE WHEN r.max_1rm > COALESCE(a.max_1rm, 0) THEN true ELSE false END as is_1rm_pr
      FROM recent_maxes r
      LEFT JOIN all_time_maxes a ON r.exercise_id = a.exercise_id
      WHERE r.max_weight > COALESCE(a.max_weight, 0) OR r.max_1rm > COALESCE(a.max_1rm, 0)
      LIMIT 10`,
      [startDateStr],
    );

    const prs: PersonalRecord[] = [];
    const rows = result.rows as {
      exercise_id: number;
      exercise_name: string;
      max_weight: number;
      max_1rm: number;
      is_weight_pr: boolean;
      is_1rm_pr: boolean;
    }[];

    for (const row of rows) {
      if (row.is_weight_pr) {
        prs.push({
          exerciseId: row.exercise_id,
          exerciseName: row.exercise_name,
          type: 'weight',
          value: row.max_weight,
          date: startDateStr,
          details: `${row.max_weight} lbs`,
        });
      }
      if (row.is_1rm_pr && !row.is_weight_pr) {
        prs.push({
          exerciseId: row.exercise_id,
          exerciseName: row.exercise_name,
          type: '1rm',
          value: Math.round(row.max_1rm),
          date: startDateStr,
          details: `Est. ${Math.round(row.max_1rm)} lbs`,
        });
      }
    }

    return prs.slice(0, 5);
  } catch {
    return [];
  }
}

// Query functions
async function fetchOverallProgress(
  range: TimeRange,
): Promise<OverallProgressMetrics> {
  const db = await getDB();
  const { startDate, endDate } = getDateRange(range);

  const workoutQuery = startDate
    ? `SELECT 
        COUNT(*) as workout_count,
        SUM(EXTRACT(EPOCH FROM (ended_at::timestamp - started_at::timestamp)) / 60) as total_minutes
       FROM workout_logs 
       WHERE date >= $1 AND date <= $2 AND status = 'completed'`
    : `SELECT 
        COUNT(*) as workout_count,
        SUM(EXTRACT(EPOCH FROM (ended_at::timestamp - started_at::timestamp)) / 60) as total_minutes
       FROM workout_logs 
       WHERE date <= $1 AND status = 'completed'`;

  const workoutResult = await db.query(
    workoutQuery,
    startDate ? [startDate, endDate] : [endDate],
  );
  const workoutStats = workoutResult.rows[0] as {
    workout_count: number;
    total_minutes: number | null;
  };

  const volumeQuery = startDate
    ? `SELECT 
        SUM(ws.weight_kg * ws.reps) as total_volume,
        COUNT(DISTINCT ws.exercise_id) as unique_exercises
       FROM workout_sets ws
       JOIN workout_logs wl ON ws.workout_log_id = wl.id
       WHERE wl.date >= $1 AND wl.date <= $2 AND wl.status = 'completed'
       AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL`
    : `SELECT 
        SUM(ws.weight_kg * ws.reps) as total_volume,
        COUNT(DISTINCT ws.exercise_id) as unique_exercises
       FROM workout_sets ws
       JOIN workout_logs wl ON ws.workout_log_id = wl.id
       WHERE wl.date <= $1 AND wl.status = 'completed'
       AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL`;

  const volumeResult = await db.query(
    volumeQuery,
    startDate ? [startDate, endDate] : [endDate],
  );
  const volumeStats = volumeResult.rows[0] as {
    total_volume: number | null;
    unique_exercises: number;
  };

  let volumeChange = 0;
  if (startDate && range !== 'all') {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const prevStart = new Date(startDate);
    prevStart.setDate(prevStart.getDate() - days);
    const prevStartDate = prevStart.toISOString().split('T')[0];

    const prevVolumeResult = await db.query(
      `SELECT SUM(ws.weight_kg * ws.reps) as total_volume
       FROM workout_sets ws
       JOIN workout_logs wl ON ws.workout_log_id = wl.id
       WHERE wl.date >= $1 AND wl.date < $2 AND wl.status = 'completed'
       AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL`,
      [prevStartDate, startDate],
    );
    const prevVolume = (
      prevVolumeResult.rows[0] as { total_volume: number | null }
    ).total_volume;

    if (prevVolume && prevVolume > 0 && volumeStats.total_volume) {
      volumeChange =
        ((volumeStats.total_volume - prevVolume) / prevVolume) * 100;
    }
  }

  const recentPRs = await fetchRecentPersonalRecords(7);

  return {
    totalVolume: Math.round(volumeStats.total_volume || 0),
    totalWorkouts: Number(workoutStats.workout_count) || 0,
    totalTimeMinutes: Math.round(workoutStats.total_minutes || 0),
    uniqueExercises: Number(volumeStats.unique_exercises) || 0,
    volumeChange: Math.round(volumeChange * 10) / 10,
    recentPRs,
  };
}

async function fetchVolumeChartData(
  range: TimeRange,
): Promise<VolumeChartData[]> {
  const db = await getDB();
  const { startDate, endDate } = getDateRange(range);

  const groupByWeek = range === '90d' || range === 'all';

  let query: string;
  let params: string[];

  if (groupByWeek) {
    query = startDate
      ? `SELECT 
          DATE_TRUNC('week', wl.date::date)::date as date,
          COALESCE(SUM(ws.weight_kg * ws.reps), 0) as volume,
          COUNT(DISTINCT wl.id) as workouts
         FROM workout_logs wl
         LEFT JOIN workout_sets ws ON wl.id = ws.workout_log_id
         WHERE wl.date >= $1 AND wl.date <= $2 AND wl.status = 'completed'
         GROUP BY DATE_TRUNC('week', wl.date::date)
         ORDER BY date`
      : `SELECT 
          DATE_TRUNC('week', wl.date::date)::date as date,
          COALESCE(SUM(ws.weight_kg * ws.reps), 0) as volume,
          COUNT(DISTINCT wl.id) as workouts
         FROM workout_logs wl
         LEFT JOIN workout_sets ws ON wl.id = ws.workout_log_id
         WHERE wl.date <= $1 AND wl.status = 'completed'
         GROUP BY DATE_TRUNC('week', wl.date::date)
         ORDER BY date`;
    params = startDate ? [startDate, endDate] : [endDate];
  } else {
    query = startDate
      ? `SELECT 
          wl.date,
          COALESCE(SUM(ws.weight_kg * ws.reps), 0) as volume,
          COUNT(DISTINCT wl.id) as workouts
         FROM workout_logs wl
         LEFT JOIN workout_sets ws ON wl.id = ws.workout_log_id
         WHERE wl.date >= $1 AND wl.date <= $2 AND wl.status = 'completed'
         GROUP BY wl.date
         ORDER BY wl.date`
      : `SELECT 
          wl.date,
          COALESCE(SUM(ws.weight_kg * ws.reps), 0) as volume,
          COUNT(DISTINCT wl.id) as workouts
         FROM workout_logs wl
         LEFT JOIN workout_sets ws ON wl.id = ws.workout_log_id
         WHERE wl.date <= $1 AND wl.status = 'completed'
         GROUP BY wl.date
         ORDER BY wl.date`;
    params = startDate ? [startDate, endDate] : [endDate];
  }

  const result = await db.query(query, params);

  return (
    result.rows as { date: string; volume: number; workouts: number }[]
  ).map((row) => ({
    date: row.date,
    volume: Math.round(Number(row.volume) || 0),
    workouts: Number(row.workouts) || 0,
  }));
}

async function fetchAllExercisesProgress(
  range: TimeRange,
): Promise<ExerciseProgressSummary[]> {
  const db = await getDB();
  const { startDate, endDate } = getDateRange(range);

  const query = startDate
    ? `SELECT DISTINCT 
        e.id as exercise_id,
        e.name as exercise_name,
        e.muscle_groups,
        e.exercise_type,
        MAX(wl.date) as last_performed,
        COUNT(DISTINCT wl.id) as total_sessions
       FROM exercises e
       JOIN workout_sets ws ON e.id = ws.exercise_id
       JOIN workout_logs wl ON ws.workout_log_id = wl.id
       WHERE wl.date >= $1 AND wl.date <= $2 AND wl.status = 'completed'
       GROUP BY e.id, e.name, e.muscle_groups, e.exercise_type
       ORDER BY last_performed DESC`
    : `SELECT DISTINCT 
        e.id as exercise_id,
        e.name as exercise_name,
        e.muscle_groups,
        e.exercise_type,
        MAX(wl.date) as last_performed,
        COUNT(DISTINCT wl.id) as total_sessions
       FROM exercises e
       JOIN workout_sets ws ON e.id = ws.exercise_id
       JOIN workout_logs wl ON ws.workout_log_id = wl.id
       WHERE wl.date <= $1 AND wl.status = 'completed'
       GROUP BY e.id, e.name, e.muscle_groups, e.exercise_type
       ORDER BY last_performed DESC`;

  const result = await db.query(
    query,
    startDate ? [startDate, endDate] : [endDate],
  );

  const exercises = result.rows as {
    exercise_id: number;
    exercise_name: string;
    muscle_groups: string;
    exercise_type: ExerciseType;
    last_performed: string;
    total_sessions: number;
  }[];

  const summaries: ExerciseProgressSummary[] = await Promise.all(
    exercises.map(async (ex) => {
      const isDurationOnly =
        ex.exercise_type === 'duration' || ex.exercise_type === 'reps_only';

      let estimated1RM: number | null = null;
      let trend: ProgressTrend = 'plateau';

      if (!isDurationOnly) {
        const recentSetResult = await db.query(
          `SELECT ws.weight_kg, ws.reps
           FROM workout_sets ws
           JOIN workout_logs wl ON ws.workout_log_id = wl.id
           WHERE ws.exercise_id = $1 AND wl.status = 'completed'
           AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL
           ORDER BY (ws.weight_kg * (1 + ws.reps::float / 30)) DESC
           LIMIT 1`,
          [ex.exercise_id],
        );

        if (recentSetResult.rows.length > 0) {
          const bestSet = recentSetResult.rows[0] as {
            weight_kg: number;
            reps: number;
          };
          estimated1RM = calculateEstimated1RM(bestSet.weight_kg, bestSet.reps);
        }

        trend = await fetchExerciseTrend(ex.exercise_id);
      }

      const prs = await fetchExercisePRs(ex.exercise_id);

      return {
        exerciseId: ex.exercise_id,
        exerciseName: ex.exercise_name,
        muscleGroups: ex.muscle_groups,
        exerciseType: ex.exercise_type,
        trend,
        lastPerformed: ex.last_performed,
        estimated1RM,
        totalSessions: Number(ex.total_sessions),
        prs,
      };
    }),
  );

  return summaries;
}

// Fetch weekly muscle group breakdown (current week)
async function fetchWeeklyMuscleStats(): Promise<WeeklyMuscleStats> {
  const db = await getDB();

  // Get current week's start (Monday) and end (Sunday)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + diffToMonday);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  // Query to get sets completed by muscle group this week
  const result = await db.query(
    `SELECT 
      e.muscle_groups,
      COUNT(ws.id) as sets_completed,
      COALESCE(SUM(ws.weight_kg * ws.reps), 0) as total_volume,
      COUNT(DISTINCT e.id) as exercise_count
     FROM workout_sets ws
     JOIN workout_logs wl ON ws.workout_log_id = wl.id
     JOIN exercises e ON ws.exercise_id = e.id
     WHERE wl.date >= $1 AND wl.date <= $2 
     AND wl.status = 'completed'
     AND ws.completed_at IS NOT NULL
     GROUP BY e.muscle_groups`,
    [weekStartStr, weekEndStr],
  );

  const rows = result.rows as {
    muscle_groups: string;
    sets_completed: number;
    total_volume: number;
    exercise_count: number;
  }[];

  // Parse and aggregate muscle groups
  const muscleMap = new Map<
    string,
    { sets: number; volume: number; exercises: Set<number> }
  >();

  for (const row of rows) {
    const muscles = row.muscle_groups
      .split(',')
      .map((m) => m.trim())
      .filter((m) => m);

    for (const muscle of muscles) {
      const normalized = normalizeMuscleGroup(muscle);
      const existing = muscleMap.get(normalized) || {
        sets: 0,
        volume: 0,
        exercises: new Set<number>(),
      };

      existing.sets += Number(row.sets_completed);
      existing.volume += Number(row.total_volume) || 0;
      // Note: exercise_count from query is per muscle_groups combo, not per individual muscle
      // For simplicity, we'll use sets as the main metric

      muscleMap.set(normalized, existing);
    }
  }

  // Calculate totals
  const totalSets = Array.from(muscleMap.values()).reduce(
    (sum, m) => sum + m.sets,
    0,
  );
  const totalVolume = Array.from(muscleMap.values()).reduce(
    (sum, m) => sum + m.volume,
    0,
  );

  // Build breakdown array
  const breakdown: MuscleGroupBreakdown[] = Array.from(muscleMap.entries()).map(
    ([muscleGroup, data]) => ({
      muscleGroup,
      setsCompleted: data.sets,
      totalVolume: Math.round(data.volume),
      exerciseCount: data.exercises.size || 1,
      percentOfTotal:
        totalSets > 0 ? Math.round((data.sets / totalSets) * 100) : 0,
    }),
  );

  // Sort by sets completed (descending)
  breakdown.sort((a, b) => b.setsCompleted - a.setsCompleted);

  return {
    weekStart: weekStartStr,
    weekEnd: weekEndStr,
    breakdown,
    totalSets,
    totalVolume: Math.round(totalVolume),
  };
}

// Fetch exercise session data for a specific exercise
async function fetchExerciseSessionData(
  exerciseId: number,
  range: TimeRange,
): Promise<ExerciseSessionData[]> {
  const db = await getDB();
  const { startDate, endDate } = getDateRange(range);

  const query = startDate
    ? `SELECT wl.date, ws.weight_kg, ws.reps, ws.set_number
       FROM workout_sets ws
       JOIN workout_logs wl ON ws.workout_log_id = wl.id
       WHERE ws.exercise_id = $1 AND wl.date >= $2 AND wl.date <= $3
       AND wl.status = 'completed'
       ORDER BY wl.date, ws.set_number`
    : `SELECT wl.date, ws.weight_kg, ws.reps, ws.set_number
       FROM workout_sets ws
       JOIN workout_logs wl ON ws.workout_log_id = wl.id
       WHERE ws.exercise_id = $1 AND wl.date <= $2
       AND wl.status = 'completed'
       ORDER BY wl.date, ws.set_number`;

  const result = await db.query(
    query,
    startDate ? [exerciseId, startDate, endDate] : [exerciseId, endDate],
  );

  const rows = result.rows as {
    date: string;
    weight_kg: number | null;
    reps: number | null;
    set_number: number;
  }[];

  // Group by date
  const sessionMap = new Map<string, ExerciseSessionData>();

  for (const row of rows) {
    const weight = row.weight_kg || 0;
    const reps = row.reps || 0;
    const volume = weight * reps;
    const est1RM = calculateEstimated1RM(weight, reps);

    if (!sessionMap.has(row.date)) {
      sessionMap.set(row.date, {
        date: row.date,
        estimated1RM: est1RM,
        bestWeight: weight,
        bestReps: reps,
        totalVolume: volume,
        totalSets: 1,
        sets: [{ weight: row.weight_kg, reps: row.reps, volume }],
      });
    } else {
      const session = sessionMap.get(row.date)!;
      session.totalVolume += volume;
      session.totalSets += 1;
      session.sets.push({
        weight: row.weight_kg,
        reps: row.reps,
        volume,
      });

      // Update best values
      if (weight > (session.bestWeight || 0)) {
        session.bestWeight = weight;
      }
      if (reps > (session.bestReps || 0)) {
        session.bestReps = reps;
      }
      if (est1RM && (!session.estimated1RM || est1RM > session.estimated1RM)) {
        session.estimated1RM = est1RM;
      }
    }
  }

  return Array.from(sessionMap.values());
}

// Maps AI-generated or user-entered muscle group names to a canonical set
// for consistent aggregation in analytics. The AI may return "Pectorals",
// "Deltoids", etc. while the UI displays standardized names like "Chest".
function normalizeMuscleGroup(muscle: string): string {
  const normalized = muscle.toLowerCase().trim();

  // Map common variations to standard names
  const mappings: Record<string, string> = {
    chest: 'Chest',
    'upper chest': 'Upper Chest',
    'mid chest': 'Mid Chest',
    'middle chest': 'Mid Chest',
    'lower chest': 'Lower Chest',
    pecs: 'Chest',
    pectorals: 'Chest',
    back: 'Back',
    'upper back': 'Upper Back',
    'mid back': 'Mid Back',
    'middle back': 'Mid Back',
    'lower back': 'Lower Back',
    lats: 'Back',
    shoulders: 'Shoulders',
    'front shoulders': 'Front Shoulders',
    'side shoulders': 'Side Shoulders',
    'rear shoulders': 'Rear Shoulders',
    delts: 'Shoulders',
    deltoids: 'Shoulders',
    'front delts': 'Front Shoulders',
    'side delts': 'Side Shoulders',
    'rear delts': 'Rear Shoulders',
    arms: 'Arms',
    biceps: 'Biceps',
    triceps: 'Triceps',
    forearms: 'Forearms',
    legs: 'Legs',
    quads: 'Quads',
    quadriceps: 'Quads',
    hamstrings: 'Hamstrings',
    calves: 'Calves',
    glutes: 'Glutes',
    'upper glutes': 'Upper Glutes',
    'lower glutes': 'Lower Glutes',
    core: 'Core',
    abs: 'Upper Abs',
    'upper abs': 'Upper Abs',
    'lower abs': 'Lower Abs',
    abdominals: 'Upper Abs',
    obliques: 'Obliques',
  };

  return mappings[normalized] || muscle;
}

// Custom hooks using TanStack Query
export function useOverallProgress(range: TimeRange) {
  return useQuery({
    queryKey: strengthProgressKeys.overview(range),
    queryFn: () => fetchOverallProgress(range),
    staleTime: 30000, // 30 seconds
  });
}

export function useVolumeChartData(range: TimeRange) {
  return useQuery({
    queryKey: strengthProgressKeys.volumeChart(range),
    queryFn: () => fetchVolumeChartData(range),
    staleTime: 30000,
  });
}

export function useAllExercisesProgress(range: TimeRange) {
  return useQuery({
    queryKey: strengthProgressKeys.exercises(range),
    queryFn: () => fetchAllExercisesProgress(range),
    staleTime: 30000,
  });
}

export function useWeeklyMuscleStats() {
  return useQuery({
    queryKey: strengthProgressKeys.weeklyMuscles(),
    queryFn: fetchWeeklyMuscleStats,
    staleTime: 60000, // 1 minute
  });
}

export function useExerciseSessionData(exerciseId: number, range: TimeRange) {
  return useQuery({
    queryKey: strengthProgressKeys.exerciseDetail(exerciseId, range),
    queryFn: () => fetchExerciseSessionData(exerciseId, range),
    staleTime: 30000,
    enabled: exerciseId > 0,
  });
}

export function useExercisePRs(exerciseId: number) {
  return useQuery({
    queryKey: strengthProgressKeys.exercisePRs(exerciseId),
    queryFn: () => fetchExercisePRs(exerciseId),
    staleTime: 60000,
    enabled: exerciseId > 0,
  });
}

// Combined hook for the Progress page
export function useStrengthProgress(range: TimeRange) {
  const overallQuery = useOverallProgress(range);
  const volumeChartQuery = useVolumeChartData(range);
  const exercisesQuery = useAllExercisesProgress(range);
  const weeklyMusclesQuery = useWeeklyMuscleStats();

  return {
    // Overview data
    overview: overallQuery.data,
    overviewLoading: overallQuery.isLoading,
    overviewError: overallQuery.error,

    // Volume chart data
    volumeChart: volumeChartQuery.data ?? [],
    volumeChartLoading: volumeChartQuery.isLoading,

    // Exercises data
    exercises: exercisesQuery.data ?? [],
    exercisesLoading: exercisesQuery.isLoading,
    exercisesError: exercisesQuery.error,

    // Weekly muscle stats
    weeklyMuscles: weeklyMusclesQuery.data,
    weeklyMusclesLoading: weeklyMusclesQuery.isLoading,

    // Combined loading state
    isLoading:
      overallQuery.isLoading ||
      volumeChartQuery.isLoading ||
      exercisesQuery.isLoading,

    // Utility function
    calculateEstimated1RM,
  };
}
