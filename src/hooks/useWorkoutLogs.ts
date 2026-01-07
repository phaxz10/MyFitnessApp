import { useState, useCallback } from 'react';
import { getDB } from '../services/db';
import type { WorkoutLog, WorkoutSet, WorkoutSetWithExercise } from '../types';

export interface WorkoutLogWithSets extends WorkoutLog {
  sets: WorkoutSetWithExercise[];
  session_name?: string;
  program_name?: string;
}

export interface ExerciseHistory {
  exercise_id: number;
  exercise_name: string;
  last_workout_date: string;
  sets: WorkoutSet[];
}

export function useWorkoutLogs() {
  const [logs, setLogs] = useState<WorkoutLogWithSets[]>([]);
  const [activeWorkout, setActiveWorkout] = useState<WorkoutLog | null>(null);
  const [activeWorkoutSets, setActiveWorkoutSets] = useState<
    WorkoutSetWithExercise[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(
    async (limit = 20): Promise<WorkoutLogWithSets[]> => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        const result = await db.query(
          `SELECT wl.*, ps.name as session_name, wp.name as program_name
         FROM workout_logs wl
         LEFT JOIN program_sessions ps ON wl.session_id = ps.id
         LEFT JOIN workout_programs wp ON wl.program_id = wp.id
         ORDER BY wl.date DESC, wl.started_at DESC
         LIMIT $1`,
          [limit],
        );
        const workoutLogs = result.rows as (WorkoutLog & {
          session_name?: string;
          program_name?: string;
        })[];

        // Fetch sets for each log
        const logsWithSets: WorkoutLogWithSets[] = await Promise.all(
          workoutLogs.map(async (log) => {
            const setsResult = await db.query(
              `SELECT ws.*, e.name as exercise_name
             FROM workout_sets ws
             JOIN exercises e ON ws.exercise_id = e.id
             WHERE ws.workout_log_id = $1
             ORDER BY ws.created_at`,
              [log.id],
            );
            return {
              ...log,
              sets: setsResult.rows as WorkoutSetWithExercise[],
            };
          }),
        );

        setLogs(logsWithSets);
        return logsWithSets;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to fetch workout logs',
        );
        return [];
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const getLogsByDateRange = useCallback(
    async (
      startDate: string,
      endDate: string,
    ): Promise<WorkoutLogWithSets[]> => {
      try {
        const db = await getDB();
        const result = await db.query(
          `SELECT wl.*, ps.name as session_name, wp.name as program_name
         FROM workout_logs wl
         LEFT JOIN program_sessions ps ON wl.session_id = ps.id
         LEFT JOIN workout_programs wp ON wl.program_id = wp.id
         WHERE wl.date >= $1 AND wl.date <= $2
         ORDER BY wl.date DESC, wl.started_at DESC`,
          [startDate, endDate],
        );
        const workoutLogs = result.rows as (WorkoutLog & {
          session_name?: string;
          program_name?: string;
        })[];

        const logsWithSets: WorkoutLogWithSets[] = await Promise.all(
          workoutLogs.map(async (log) => {
            const setsResult = await db.query(
              `SELECT ws.*, e.name as exercise_name
             FROM workout_sets ws
             JOIN exercises e ON ws.exercise_id = e.id
             WHERE ws.workout_log_id = $1
             ORDER BY ws.created_at`,
              [log.id],
            );
            return {
              ...log,
              sets: setsResult.rows as WorkoutSetWithExercise[],
            };
          }),
        );

        return logsWithSets;
      } catch {
        return [];
      }
    },
    [],
  );

  const startWorkout = useCallback(
    async (
      programId: number | null = null,
      sessionId: number | null = null,
    ): Promise<WorkoutLog> => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        const now = new Date().toISOString();
        const today = now.split('T')[0];

        const result = await db.query(
          `INSERT INTO workout_logs (program_id, session_id, date, started_at)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
          [programId, sessionId, today, now],
        );
        const workout = (result.rows as WorkoutLog[])[0];
        setActiveWorkout(workout);
        setActiveWorkoutSets([]);
        return workout;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to start workout',
        );
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const endWorkout = useCallback(
    async (workoutId: number, notes?: string): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        const now = new Date().toISOString();

        await db.query(
          `UPDATE workout_logs SET ended_at = $1, notes = $2 WHERE id = $3`,
          [now, notes || null, workoutId],
        );
        setActiveWorkout(null);
        setActiveWorkoutSets([]);
        await fetchLogs();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to end workout');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchLogs],
  );

  const cancelWorkout = useCallback(
    async (workoutId: number): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        await db.query('DELETE FROM workout_logs WHERE id = $1', [workoutId]);
        setActiveWorkout(null);
        setActiveWorkoutSets([]);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to cancel workout',
        );
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const addSet = useCallback(
    async (
      workoutLogId: number,
      exerciseId: number,
      reps: number | null,
      weightKg: number | null,
      durationSeconds: number | null = null,
      notes?: string,
    ): Promise<WorkoutSetWithExercise> => {
      try {
        const db = await getDB();

        // Get the next set number for this exercise in this workout
        const countResult = await db.query(
          `SELECT COUNT(*) as count FROM workout_sets 
         WHERE workout_log_id = $1 AND exercise_id = $2`,
          [workoutLogId, exerciseId],
        );
        const count = (countResult.rows as { count: number }[])[0].count;
        const setNumber = Number(count) + 1;

        const result = await db.query(
          `INSERT INTO workout_sets (workout_log_id, exercise_id, set_number, reps, weight_kg, duration_seconds, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
          [
            workoutLogId,
            exerciseId,
            setNumber,
            reps,
            weightKg,
            durationSeconds,
            notes || null,
          ],
        );
        const newSet = (result.rows as WorkoutSet[])[0];

        // Get exercise name
        const exerciseResult = await db.query(
          'SELECT name FROM exercises WHERE id = $1',
          [exerciseId],
        );
        const exerciseName =
          (exerciseResult.rows as { name: string }[])[0]?.name || '';

        const setWithExercise: WorkoutSetWithExercise = {
          ...newSet,
          exercise_name: exerciseName,
        };

        setActiveWorkoutSets((prev) => [...prev, setWithExercise]);
        return setWithExercise;
      } catch (err) {
        throw err;
      }
    },
    [],
  );

  const updateSet = useCallback(
    async (
      setId: number,
      data: {
        reps?: number | null;
        weight_kg?: number | null;
        duration_seconds?: number | null;
        notes?: string;
      },
    ): Promise<void> => {
      try {
        const db = await getDB();
        const fields: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined) {
            fields.push(`${key} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
          }
        });

        if (fields.length > 0) {
          values.push(setId);
          await db.query(
            `UPDATE workout_sets SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
            values,
          );

          setActiveWorkoutSets((prev) =>
            prev.map((set) => (set.id === setId ? { ...set, ...data } : set)),
          );
        }
      } catch (err) {
        throw err;
      }
    },
    [],
  );

  const deleteSet = useCallback(async (setId: number): Promise<void> => {
    try {
      const db = await getDB();
      await db.query('DELETE FROM workout_sets WHERE id = $1', [setId]);
      setActiveWorkoutSets((prev) => prev.filter((set) => set.id !== setId));
    } catch (err) {
      throw err;
    }
  }, []);

  const getExerciseHistory = useCallback(
    async (exerciseId: number, limit = 5): Promise<ExerciseHistory | null> => {
      try {
        const db = await getDB();

        // Get exercise name
        const exerciseResult = await db.query(
          'SELECT name FROM exercises WHERE id = $1',
          [exerciseId],
        );
        if ((exerciseResult.rows as { name: string }[]).length === 0)
          return null;
        const exerciseName = (exerciseResult.rows as { name: string }[])[0]
          .name;

        // Get the most recent workout logs that include this exercise
        const logsResult = await db.query(
          `SELECT DISTINCT wl.id, wl.date
         FROM workout_logs wl
         JOIN workout_sets ws ON wl.id = ws.workout_log_id
         WHERE ws.exercise_id = $1
         ORDER BY wl.date DESC
         LIMIT $2`,
          [exerciseId, limit],
        );
        const logs = logsResult.rows as { id: number; date: string }[];

        if (logs.length === 0) return null;

        // Get all sets from these workout logs for this exercise
        const logIds = logs.map((l) => l.id);
        const setsResult = await db.query(
          `SELECT ws.*
         FROM workout_sets ws
         JOIN workout_logs wl ON ws.workout_log_id = wl.id
         WHERE ws.exercise_id = $1 AND ws.workout_log_id = ANY($2)
         ORDER BY wl.date DESC, ws.set_number`,
          [exerciseId, logIds],
        );

        return {
          exercise_id: exerciseId,
          exercise_name: exerciseName,
          last_workout_date: logs[0].date,
          sets: setsResult.rows as WorkoutSet[],
        };
      } catch {
        return null;
      }
    },
    [],
  );

  const getLastPerformance = useCallback(
    async (exerciseId: number): Promise<WorkoutSet[] | null> => {
      try {
        const db = await getDB();

        // Get the most recent workout log that includes this exercise
        const logResult = await db.query(
          `SELECT wl.id
         FROM workout_logs wl
         JOIN workout_sets ws ON wl.id = ws.workout_log_id
         WHERE ws.exercise_id = $1
         ORDER BY wl.date DESC, wl.started_at DESC
         LIMIT 1`,
          [exerciseId],
        );

        if ((logResult.rows as { id: number }[]).length === 0) return null;
        const logId = (logResult.rows as { id: number }[])[0].id;

        // Get all sets from that workout for this exercise
        const setsResult = await db.query(
          `SELECT * FROM workout_sets 
         WHERE workout_log_id = $1 AND exercise_id = $2
         ORDER BY set_number`,
          [logId, exerciseId],
        );

        return setsResult.rows as WorkoutSet[];
      } catch {
        return null;
      }
    },
    [],
  );

  const loadActiveWorkoutSets = useCallback(
    async (workoutLogId: number): Promise<void> => {
      try {
        const db = await getDB();
        const result = await db.query(
          `SELECT ws.*, e.name as exercise_name
         FROM workout_sets ws
         JOIN exercises e ON ws.exercise_id = e.id
         WHERE ws.workout_log_id = $1
         ORDER BY ws.created_at`,
          [workoutLogId],
        );
        setActiveWorkoutSets(result.rows as WorkoutSetWithExercise[]);
      } catch (err) {
        console.error('Failed to load active workout sets:', err);
      }
    },
    [],
  );

  const resumeWorkout = useCallback(async (): Promise<WorkoutLog | null> => {
    try {
      const db = await getDB();
      // Find any workout that was started today and not ended
      const today = new Date().toISOString().split('T')[0];
      const result = await db.query(
        `SELECT * FROM workout_logs 
         WHERE date = $1 AND ended_at IS NULL
         ORDER BY started_at DESC
         LIMIT 1`,
        [today],
      );

      if ((result.rows as WorkoutLog[]).length === 0) return null;

      const workout = (result.rows as WorkoutLog[])[0];
      setActiveWorkout(workout);
      await loadActiveWorkoutSets(workout.id);
      return workout;
    } catch {
      return null;
    }
  }, [loadActiveWorkoutSets]);

  const deleteLog = useCallback(
    async (logId: number): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        await db.query('DELETE FROM workout_logs WHERE id = $1', [logId]);
        await fetchLogs();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to delete workout log',
        );
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchLogs],
  );

  return {
    logs,
    activeWorkout,
    activeWorkoutSets,
    loading,
    error,
    fetchLogs,
    getLogsByDateRange,
    startWorkout,
    endWorkout,
    cancelWorkout,
    addSet,
    updateSet,
    deleteSet,
    getExerciseHistory,
    getLastPerformance,
    loadActiveWorkoutSets,
    resumeWorkout,
    deleteLog,
  };
}
