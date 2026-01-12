import { useState, useCallback } from 'react';
import { getDB } from '../services/db';
import { getLocalDateString } from '../utils/date';
import type {
  ExerciseProgressSummary,
  OverallProgressMetrics,
  PersonalRecord,
  ExerciseSessionData,
  VolumeChartData,
  ExercisePR,
  ProgressTrend,
  ExerciseType,
} from '../types';

// Calculate estimated 1RM using Epley formula
export function calculateEstimated1RM(
  weight: number,
  reps: number,
): number | null {
  if (weight <= 0 || reps <= 0) return null;
  if (reps === 1) return weight;
  // Epley formula: 1RM = weight × (1 + reps/30)
  return Math.round(weight * (1 + reps / 30));
}

// Get date range based on filter
function getDateRange(range: '7d' | '30d' | '90d' | 'all'): {
  startDate: string | null;
  endDate: string;
} {
  const endDate = getLocalDateString();
  if (range === 'all') {
    return { startDate: null, endDate };
  }

  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startDate = start.toISOString().split('T')[0];

  return { startDate, endDate };
}

// Get PRs for a specific exercise (standalone function)
async function fetchExercisePRs(exerciseId: number): Promise<ExercisePR> {
  try {
    const db = await getDB();

    // Max weight
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

    // Max reps (at any weight above 0)
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

    // Max volume in a single session
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

    // Max estimated 1RM
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

// Calculate exercise trend by comparing recent vs older sessions (standalone function)
async function fetchExerciseTrend(exerciseId: number): Promise<ProgressTrend> {
  try {
    const db = await getDB();

    // Get last 8 sessions' estimated 1RMs
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

    // Compare average of last 4 sessions vs previous 4
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

// Get recent personal records across all exercises (standalone function)
async function fetchRecentPersonalRecords(
  days: number,
): Promise<PersonalRecord[]> {
  try {
    const db = await getDB();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    // This is a simplified approach - find max weight achievements in the period
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

    return prs.slice(0, 5); // Return top 5 PRs
  } catch {
    return [];
  }
}

export function useExerciseProgress() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get overall progress metrics for a date range
  const getOverallProgress = useCallback(
    async (
      range: '7d' | '30d' | '90d' | 'all',
    ): Promise<OverallProgressMetrics> => {
      setLoading(true);
      setError(null);

      try {
        const db = await getDB();
        const { startDate, endDate } = getDateRange(range);

        // Get workout stats
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

        // Get volume and exercise stats
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

        // Calculate volume change (compare to previous period)
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

        // Get recent PRs (last 7 days regardless of range filter)
        const recentPRs = await fetchRecentPersonalRecords(7);

        return {
          totalVolume: Math.round(volumeStats.total_volume || 0),
          totalWorkouts: Number(workoutStats.workout_count) || 0,
          totalTimeMinutes: Math.round(workoutStats.total_minutes || 0),
          uniqueExercises: Number(volumeStats.unique_exercises) || 0,
          volumeChange: Math.round(volumeChange * 10) / 10,
          recentPRs,
        };
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to get overall progress',
        );
        return {
          totalVolume: 0,
          totalWorkouts: 0,
          totalTimeMinutes: 0,
          uniqueExercises: 0,
          volumeChange: 0,
          recentPRs: [],
        };
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Get volume chart data grouped by day or week
  const getVolumeChartData = useCallback(
    async (range: '7d' | '30d' | '90d' | 'all'): Promise<VolumeChartData[]> => {
      try {
        const db = await getDB();
        const { startDate, endDate } = getDateRange(range);

        // For longer ranges, group by week
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
      } catch {
        return [];
      }
    },
    [],
  );

  // Get all exercises with their progress summary
  const getAllExercisesProgress = useCallback(
    async (
      range: '7d' | '30d' | '90d' | 'all',
    ): Promise<ExerciseProgressSummary[]> => {
      try {
        const db = await getDB();
        const { startDate, endDate } = getDateRange(range);

        // Get all exercises that have been performed
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

        // Get progress details for each exercise
        const summaries: ExerciseProgressSummary[] = await Promise.all(
          exercises.map(async (ex) => {
            // Skip duration-only exercises for 1RM calculation
            const isDurationOnly =
              ex.exercise_type === 'duration' ||
              ex.exercise_type === 'reps_only';

            let estimated1RM: number | null = null;
            let trend: ProgressTrend = 'plateau';

            if (!isDurationOnly) {
              // Get most recent best set for 1RM estimate
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
                estimated1RM = calculateEstimated1RM(
                  bestSet.weight_kg,
                  bestSet.reps,
                );
              }

              // Calculate trend by comparing recent sessions to older ones
              trend = await fetchExerciseTrend(ex.exercise_id);
            }

            // Get PRs for this exercise
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
      } catch {
        return [];
      }
    },
    [],
  );

  // Get detailed session data for a specific exercise
  const getExerciseSessionData = useCallback(
    async (
      exerciseId: number,
      range: '7d' | '30d' | '90d' | 'all',
    ): Promise<ExerciseSessionData[]> => {
      try {
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
            if (
              est1RM &&
              (!session.estimated1RM || est1RM > session.estimated1RM)
            ) {
              session.estimated1RM = est1RM;
            }
          }
        }

        return Array.from(sessionMap.values());
      } catch {
        return [];
      }
    },
    [],
  );

  return {
    loading,
    error,
    getOverallProgress,
    getVolumeChartData,
    getAllExercisesProgress,
    getExerciseSessionData,
    getExercisePRs: fetchExercisePRs,
    calculateEstimated1RM,
  };
}
