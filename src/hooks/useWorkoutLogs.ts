import { useCallback, useState } from 'react';
import { getDB } from '../services/db';
import {
  resumableWorkout,
  sessionStatusForDate,
} from '../services/queries/dashboard';
// WorkoutLogWithSets now lives in the shared query types module.
// Import for local use and re-export so existing consumers don't change imports.
import type { WorkoutLogWithSets } from '../services/queries/types';
import * as workoutHistory from '../services/queries/workoutHistory';
import * as WorkoutWriter from '../services/writers/workoutWriter';
import type {
  ExerciseNote,
  WorkoutLog,
  WorkoutLogExercise,
  WorkoutLogExerciseWithDetails,
  WorkoutSet,
  WorkoutSetWithExercise,
  WorkoutStatus,
} from '../types';
import { getLocalDateString, getLocalTimestamp } from '../utils/date';

export type { WorkoutLogWithSets } from '../services/queries/types';

export function useWorkoutLogs() {
  const [logs, setLogs] = useState<WorkoutLogWithSets[]>([]);
  const [activeWorkout, setActiveWorkout] = useState<WorkoutLog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async (limit = 20) => {
    setLoading(true);
    setError(null);
    try {
      const db = await getDB();
      const logsWithSets = await workoutHistory.recent(db, limit);
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
  }, []);

  // Copy exercises from program session template to workout_log_exercises
  // AND pre-create all workout_sets records (empty, with NULL values)
  const startWorkout = useCallback(
    async (
      programId: number | null = null,
      sessionId: number | null = null,
      dateOverride?: string, // Optional date override for logging past sessions (YYYY-MM-DD)
    ): Promise<WorkoutLog> => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        const targetDate = dateOverride || getLocalDateString();

        // For past dates, set started_at to a reasonable time (9:00 AM on that date)
        // For today, use current time
        let startedAt: string;
        if (dateOverride && dateOverride !== getLocalDateString()) {
          // Past date: use 9:00 AM as default start time
          startedAt = `${dateOverride}T09:00:00`;
        } else {
          // Today: use current time
          startedAt = getLocalTimestamp();
        }

        // Returns the in-progress workout instead if there is one (double tap).
        const workout = await WorkoutWriter.startWorkout(db, {
          programId,
          sessionId,
          date: targetDate,
          startedAt,
        });

        setActiveWorkout(workout);
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
        const localISOString = getLocalTimestamp();

        await db.query(
          `UPDATE workout_logs SET ended_at = $1, notes = $2, status = 'completed' WHERE id = $3`,
          [localISOString, notes || null, workoutId],
        );
        setActiveWorkout(null);
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

  // Mark a set as completed (sets completed_at timestamp)
  const completeSet = useCallback(async (setId: number): Promise<void> => {
    const db = await getDB();
    const localISOString = getLocalTimestamp();
    await db.query(`UPDATE workout_sets SET completed_at = $1 WHERE id = $2`, [
      localISOString,
      setId,
    ]);
  }, []);

  // Uncomplete a set (sets completed_at to NULL)
  const uncompleteSet = useCallback(async (setId: number): Promise<void> => {
    const db = await getDB();
    await db.query(
      `UPDATE workout_sets SET completed_at = NULL WHERE id = $1`,
      [setId],
    );
  }, []);

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
      }
    },
    [],
  );

  // Delete exactly these sets (by id) and renumber what is left.
  const deleteSets = useCallback(
    async (setIds: readonly number[]): Promise<void> => {
      const db = await getDB();
      await WorkoutWriter.deleteSets(db, setIds);
    },
    [],
  );

  // Add a new set to a workout log exercise (used by "+ Add Set")
  const addSetToExercise = useCallback(
    async (workoutLogExerciseId: number): Promise<WorkoutSet> => {
      const db = await getDB();
      return WorkoutWriter.addSet(db, workoutLogExerciseId);
    },
    [],
  );

  // Add a round to a superset: one set for EACH exercise in it, same number
  const addRoundToSuperset = useCallback(
    async (
      workoutLogId: number,
      supersetGroupId: string,
    ): Promise<WorkoutSet[]> => {
      const db = await getDB();
      return WorkoutWriter.addSupersetRound(db, workoutLogId, supersetGroupId);
    },
    [],
  );

  // Get all workout_sets for a workout log (ordered by workout_log_exercise and set_number)
  const getWorkoutSets = useCallback(
    async (workoutLogId: number): Promise<WorkoutSetWithExercise[]> => {
      const db = await getDB();
      const result = await db.query(
        `SELECT ws.*, e.name as exercise_name
         FROM workout_sets ws
         JOIN exercises e ON ws.exercise_id = e.id
         WHERE ws.workout_log_id = $1
         ORDER BY ws.workout_log_exercise_id, ws.set_number`,
        [workoutLogId],
      );
      return result.rows as WorkoutSetWithExercise[];
    },
    [],
  );

  const resumeWorkout = useCallback(
    async (dateOverride?: string): Promise<WorkoutLog | null> => {
      try {
        // The in-progress workout whatever its date (one that crossed
        // midnight is still in progress); a ?date only breaks ties.
        const workout = await resumableWorkout(await getDB(), {
          preferDate: dateOverride,
        });
        if (!workout) return null;
        setActiveWorkout(workout);
        return workout;
      } catch {
        return null;
      }
    },
    [],
  );

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

  // Exercise Notes functions (per-exercise notes tied to master exercise)
  const addExerciseNote = useCallback(
    async (exerciseId: number, content: string): Promise<ExerciseNote> => {
      const db = await getDB();
      const result = await db.query(
        `INSERT INTO exercise_notes (exercise_id, content)
         VALUES ($1, $2)
         RETURNING *`,
        [exerciseId, content],
      );
      return (result.rows as ExerciseNote[])[0];
    },
    [],
  );

  const getExerciseNotes = useCallback(
    async (exerciseId: number): Promise<ExerciseNote[]> => {
      const db = await getDB();
      const result = await db.query(
        `SELECT * FROM exercise_notes 
         WHERE exercise_id = $1 
         ORDER BY created_at ASC`,
        [exerciseId],
      );
      return result.rows as ExerciseNote[];
    },
    [],
  );

  const deleteExerciseNote = useCallback(
    async (noteId: number): Promise<void> => {
      const db = await getDB();
      await db.query('DELETE FROM exercise_notes WHERE id = $1', [noteId]);
    },
    [],
  );

  // ============================================
  // Workout Log Exercises CRUD
  // ============================================

  // Get all exercises for a workout log (with exercise details)
  const getWorkoutLogExercises = useCallback(
    async (workoutLogId: number): Promise<WorkoutLogExerciseWithDetails[]> => {
      const db = await getDB();
      const result = await db.query(
        `SELECT wle.*, 
                e.name as exercise_name, 
                e.description as exercise_description,
                e.muscle_groups,
                e.equipment,
                e.exercise_type
         FROM workout_log_exercises wle
         JOIN exercises e ON wle.exercise_id = e.id
         WHERE wle.workout_log_id = $1
         ORDER BY wle.order_index`,
        [workoutLogId],
      );
      return result.rows as WorkoutLogExerciseWithDetails[];
    },
    [],
  );

  const addWorkoutLogExercise = useCallback(
    async (
      workoutLogId: number,
      exerciseId: number,
      data: {
        orderIndex: number;
        supersetGroupId?: string | null;
        targetSets?: number | null;
        targetRepMin?: number | null;
        targetRepMax?: number | null;
        targetDurationSeconds?: number | null;
        notes?: string | null;
      },
    ): Promise<{ exercise: WorkoutLogExercise; sets: WorkoutSet[] }> => {
      const db = await getDB();
      return WorkoutWriter.addExercise(db, workoutLogId, exerciseId, {
        orderIndex: data.orderIndex,
        supersetGroupId: data.supersetGroupId,
        targetSets: data.targetSets,
        targetRepMin: data.targetRepMin,
        targetRepMax: data.targetRepMax,
        targetDurationSeconds: data.targetDurationSeconds,
        notes: data.notes,
      });
    },
    [],
  );

  // Update a workout log exercise
  const updateWorkoutLogExercise = useCallback(
    async (
      workoutLogExerciseId: number,
      data: {
        orderIndex?: number;
        supersetGroupId?: string | null;
        targetSets?: number | null;
        targetRepMin?: number | null;
        targetRepMax?: number | null;
        targetDurationSeconds?: number | null;
        notes?: string | null;
      },
    ): Promise<void> => {
      const db = await getDB();
      const fields: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      const fieldMapping: Record<string, string> = {
        orderIndex: 'order_index',
        supersetGroupId: 'superset_group_id',
        targetSets: 'target_sets',
        targetRepMin: 'target_rep_min',
        targetRepMax: 'target_rep_max',
        targetDurationSeconds: 'target_duration_seconds',
        notes: 'notes',
      };

      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && fieldMapping[key]) {
          fields.push(`${fieldMapping[key]} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      });

      if (fields.length > 0) {
        values.push(workoutLogExerciseId);
        await db.query(
          `UPDATE workout_log_exercises SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
          values,
        );
      }
    },
    [],
  );

  // Delete workout log exercises (and their sets via cascade), one statement
  const deleteWorkoutLogExercises = useCallback(
    async (workoutLogExerciseIds: readonly number[]): Promise<void> => {
      const db = await getDB();
      await WorkoutWriter.deleteWorkoutLogExercises(db, workoutLogExerciseIds);
    },
    [],
  );

  // Reorder exercises in a workout log
  const reorderWorkoutLogExercises = useCallback(
    async (
      workoutLogId: number,
      exerciseOrder: { id: number; orderIndex: number }[],
    ): Promise<void> => {
      const db = await getDB();
      for (const { id, orderIndex } of exerciseOrder) {
        await db.query(
          `UPDATE workout_log_exercises SET order_index = $1 WHERE id = $2 AND workout_log_id = $3`,
          [orderIndex, id, workoutLogId],
        );
      }
    },
    [],
  );

  // Close out abandoned in_progress workouts (started over 12h ago) as
  // incomplete or missed. Called on app startup.
  const processStaleWorkouts = useCallback(async (): Promise<void> => {
    try {
      const db = await getDB();
      await WorkoutWriter.markStaleWorkouts(db, new Date());
    } catch (err) {
      console.error('Failed to process stale workouts:', err);
    }
  }, []);

  // Check if a program session already has a completed workout today
  const isSessionCompletedToday = useCallback(
    async (sessionId: number): Promise<boolean> => {
      try {
        const db = await getDB();
        const today = getLocalDateString();

        // Check for status = 'completed' OR legacy records with ended_at set
        const result = await db.query(
          `SELECT COUNT(*) as count FROM workout_logs 
           WHERE session_id = $1 AND date = $2 
           AND (status = 'completed' OR (status IS NULL AND ended_at IS NOT NULL))`,
          [sessionId, today],
        );

        const count = (result.rows as { count: number }[])[0].count;
        return Number(count) > 0;
      } catch {
        return false;
      }
    },
    [],
  );

  // Get today's workout status for a specific session (for UI display)
  // Optionally accepts a date to check status for past dates (for missed workout logging)
  const getSessionStatusForDate = useCallback(
    async (
      sessionId: number,
      date?: string, // Optional: YYYY-MM-DD format, defaults to today
    ): Promise<{
      hasWorkout: boolean;
      status: WorkoutStatus | null;
      workoutId: number | null;
    }> => {
      try {
        return await sessionStatusForDate(
          await getDB(),
          sessionId,
          date || getLocalDateString(),
        );
      } catch {
        return { hasWorkout: false, status: null, workoutId: null };
      }
    },
    [],
  );

  return {
    logs,
    activeWorkout,
    loading,
    error,
    fetchLogs,
    startWorkout,
    endWorkout,
    cancelWorkout,
    updateSet,
    deleteSets,
    completeSet,
    uncompleteSet,
    addSetToExercise,
    addRoundToSuperset,
    getWorkoutSets,
    resumeWorkout,
    deleteLog,
    addExerciseNote,
    getExerciseNotes,
    deleteExerciseNote,
    processStaleWorkouts,
    isSessionCompletedToday,
    getSessionStatusForDate,
    // Backwards compatibility alias
    getTodaySessionStatus: getSessionStatusForDate,
    // Workout Log Exercises CRUD
    getWorkoutLogExercises,
    addWorkoutLogExercise,
    updateWorkoutLogExercise,
    deleteWorkoutLogExercises,
    reorderWorkoutLogExercises,
  };
}
