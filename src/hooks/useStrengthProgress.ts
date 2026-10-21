import { useQuery } from '@tanstack/react-query';
import { getDB } from '../services/db';
import {
  calculateEstimated1RM,
  exercisesProgress,
  getDateRange,
  overallProgress,
  type TimeRange,
} from '../services/queries/strengthProgress';
import type {
  ExercisePR,
  ExerciseSessionData,
  VolumeChartData,
} from '../types';
import { pgDate } from '../utils/pgValues';

export type { TimeRange };
export { calculateEstimated1RM };

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

// Get PRs for a specific exercise
export async function fetchExercisePRs(
  exerciseId: number,
): Promise<ExercisePR> {
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
              reps: (maxWeightResult.rows[0] as { reps: number | null }).reps,
              date: pgDate((maxWeightResult.rows[0] as { date: unknown }).date),
            }
          : null,
      maxReps:
        maxRepsResult.rows.length > 0
          ? {
              value: (maxRepsResult.rows[0] as { value: number }).value,
              weight: (maxRepsResult.rows[0] as { weight: number }).weight,
              date: pgDate((maxRepsResult.rows[0] as { date: unknown }).date),
            }
          : null,
      maxVolume:
        maxVolumeResult.rows.length > 0
          ? {
              value: Math.round(
                (maxVolumeResult.rows[0] as { value: number }).value,
              ),
              date: pgDate((maxVolumeResult.rows[0] as { date: unknown }).date),
            }
          : null,
      max1RM:
        max1RMResult.rows.length > 0
          ? {
              value: Math.round(
                (max1RMResult.rows[0] as { value: number }).value,
              ),
              date: pgDate((max1RMResult.rows[0] as { date: unknown }).date),
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
    date: pgDate(row.date),
    volume: Math.round(Number(row.volume) || 0),
    workouts: Number(row.workouts) || 0,
  }));
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
export async function fetchExerciseSessionData(
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

    const date = pgDate(row.date);

    if (!sessionMap.has(date)) {
      sessionMap.set(date, {
        date,
        estimated1RM: est1RM,
        bestWeight: weight,
        bestReps: reps,
        totalVolume: volume,
        totalSets: 1,
        sets: [{ weight: row.weight_kg, reps: row.reps, volume }],
      });
    } else {
      const session = sessionMap.get(date)!;
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
    queryFn: async () => overallProgress(await getDB(), range),
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
    queryFn: async () => exercisesProgress(await getDB(), range),
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
