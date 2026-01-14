import { useCallback, useState } from 'react';
import { getDB } from '../services/db';
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

  // Copy exercises from program session template to workout_log_exercises
  // AND pre-create all workout_sets records (empty, with NULL values)
  const copySessionExercisesToWorkout = useCallback(
    async (workoutLogId: number, sessionId: number): Promise<void> => {
      console.log(
        '[copySessionExercisesToWorkout] Starting with workoutLogId:',
        workoutLogId,
        'sessionId:',
        sessionId,
      );
      const db = await getDB();

      // Get all exercises from the program session
      const result = await db.query(
        `SELECT exercise_id, order_index, superset_group_id, target_sets, 
                target_rep_min, target_rep_max, target_duration_seconds, notes
         FROM program_exercises
         WHERE session_id = $1
         ORDER BY order_index`,
        [sessionId],
      );

      const programExercises = result.rows as {
        exercise_id: number;
        order_index: number;
        superset_group_id: string | null;
        target_sets: number;
        target_rep_min: number | null;
        target_rep_max: number | null;
        target_duration_seconds: number | null;
        notes: string | null;
      }[];

      console.log(
        '[copySessionExercisesToWorkout] Found programExercises:',
        programExercises.length,
        programExercises,
      );

      // Insert each exercise into workout_log_exercises AND pre-create its sets
      for (const ex of programExercises) {
        console.log(
          '[copySessionExercisesToWorkout] Inserting exercise:',
          ex.exercise_id,
          'target_sets:',
          ex.target_sets,
        );
        const insertResult = await db.query(
          `INSERT INTO workout_log_exercises 
           (workout_log_id, exercise_id, order_index, superset_group_id, 
            target_sets, target_rep_min, target_rep_max, target_duration_seconds, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            workoutLogId,
            ex.exercise_id,
            ex.order_index,
            ex.superset_group_id,
            ex.target_sets,
            ex.target_rep_min,
            ex.target_rep_max,
            ex.target_duration_seconds,
            ex.notes,
          ],
        );

        const workoutLogExerciseId = (insertResult.rows as { id: number }[])[0]
          .id;
        console.log(
          '[copySessionExercisesToWorkout] Created workout_log_exercise id:',
          workoutLogExerciseId,
        );

        // Pre-create all workout_sets for this exercise (empty, NULL values)
        const targetSets = ex.target_sets || 3;
        console.log(
          '[copySessionExercisesToWorkout] Creating',
          targetSets,
          'sets for exercise',
        );
        for (let setNum = 1; setNum <= targetSets; setNum++) {
          await db.query(
            `INSERT INTO workout_sets 
             (workout_log_id, exercise_id, workout_log_exercise_id, set_number, reps, weight_kg, duration_seconds, completed_at)
             VALUES ($1, $2, $3, $4, NULL, NULL, NULL, NULL)`,
            [workoutLogId, ex.exercise_id, workoutLogExerciseId, setNum],
          );
        }
        console.log(
          '[copySessionExercisesToWorkout] Finished creating sets for exercise',
          ex.exercise_id,
        );
      }
      console.log('[copySessionExercisesToWorkout] COMPLETED');
    },
    [],
  );

  const startWorkout = useCallback(
    async (
      programId: number | null = null,
      sessionId: number | null = null,
      dateOverride?: string, // Optional date override for logging past sessions
    ): Promise<WorkoutLog> => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        const localISOString = getLocalTimestamp();
        const targetDate = dateOverride || getLocalDateString();

        const result = await db.query(
          `INSERT INTO workout_logs (program_id, session_id, date, started_at, status)
         VALUES ($1, $2, $3, $4, 'in_progress')
         RETURNING *`,
          [programId, sessionId, targetDate, localISOString],
        );
        const workout = (result.rows as WorkoutLog[])[0];

        // If starting from a program session, copy exercises to workout_log_exercises
        // AND pre-create all workout_sets records
        if (sessionId) {
          await copySessionExercisesToWorkout(workout.id, sessionId);
        }

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
    [copySessionExercisesToWorkout],
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
      workoutLogExerciseId?: number | null,
    ): Promise<WorkoutSetWithExercise> => {
      const db = await getDB();

      // Get the next set number for this exercise in this workout
      // Use workout_log_exercise_id if provided, otherwise fall back to exercise_id
      const countQuery = workoutLogExerciseId
        ? `SELECT COUNT(*) as count FROM workout_sets 
           WHERE workout_log_id = $1 AND workout_log_exercise_id = $2`
        : `SELECT COUNT(*) as count FROM workout_sets 
           WHERE workout_log_id = $1 AND exercise_id = $2`;
      const countResult = await db.query(countQuery, [
        workoutLogId,
        workoutLogExerciseId ?? exerciseId,
      ]);
      const count = (countResult.rows as { count: number }[])[0].count;
      const setNumber = Number(count) + 1;

      const result = await db.query(
        `INSERT INTO workout_sets (workout_log_id, exercise_id, workout_log_exercise_id, set_number, reps, weight_kg, duration_seconds, notes, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
         RETURNING *`,
        [
          workoutLogId,
          exerciseId,
          workoutLogExerciseId ?? null,
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
    setActiveWorkoutSets((prev) =>
      prev.map((set) =>
        set.id === setId ? { ...set, completed_at: localISOString } : set,
      ),
    );
  }, []);

  // Uncomplete a set (sets completed_at to NULL)
  const uncompleteSet = useCallback(async (setId: number): Promise<void> => {
    const db = await getDB();
    await db.query(
      `UPDATE workout_sets SET completed_at = NULL WHERE id = $1`,
      [setId],
    );
    setActiveWorkoutSets((prev) =>
      prev.map((set) =>
        set.id === setId ? { ...set, completed_at: null } : set,
      ),
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

        setActiveWorkoutSets((prev) =>
          prev.map((set) => (set.id === setId ? { ...set, ...data } : set)),
        );
      }
    },
    [],
  );

  const deleteSet = useCallback(async (setId: number): Promise<void> => {
    const db = await getDB();
    await db.query('DELETE FROM workout_sets WHERE id = $1', [setId]);
    setActiveWorkoutSets((prev) => prev.filter((set) => set.id !== setId));
  }, []);

  // Add a new set to a workout log exercise (inserts a new row in DB)
  // Used when user clicks "+ Add Set" for a single exercise
  const addSetToExercise = useCallback(
    async (workoutLogExerciseId: number): Promise<WorkoutSet> => {
      const db = await getDB();

      // Get workout_log_exercise details
      const wleResult = await db.query(
        `SELECT wle.*, e.name as exercise_name 
         FROM workout_log_exercises wle
         JOIN exercises e ON wle.exercise_id = e.id
         WHERE wle.id = $1`,
        [workoutLogExerciseId],
      );
      const wle = (
        wleResult.rows as (WorkoutLogExercise & { exercise_name: string })[]
      )[0];
      if (!wle) throw new Error('Workout log exercise not found');

      // Get the current highest set number
      const countResult = await db.query(
        `SELECT COALESCE(MAX(set_number), 0) as max_set 
         FROM workout_sets 
         WHERE workout_log_exercise_id = $1`,
        [workoutLogExerciseId],
      );
      const maxSet = Number(
        (countResult.rows as { max_set: number }[])[0].max_set,
      );
      const newSetNumber = maxSet + 1;

      // Insert new empty set
      const result = await db.query(
        `INSERT INTO workout_sets 
         (workout_log_id, exercise_id, workout_log_exercise_id, set_number, reps, weight_kg, duration_seconds, completed_at)
         VALUES ($1, $2, $3, $4, NULL, NULL, NULL, NULL)
         RETURNING *`,
        [
          wle.workout_log_id,
          wle.exercise_id,
          workoutLogExerciseId,
          newSetNumber,
        ],
      );

      const newSet = (result.rows as WorkoutSet[])[0];

      // Update local state
      const setWithExercise: WorkoutSetWithExercise = {
        ...newSet,
        exercise_name: wle.exercise_name,
      };
      setActiveWorkoutSets((prev) => [...prev, setWithExercise]);

      return newSet;
    },
    [],
  );

  // Remove the last set from a workout log exercise (deletes from DB)
  // Used when user clicks "- Remove Set" for a single exercise
  const removeSetFromExercise = useCallback(
    async (workoutLogExerciseId: number): Promise<void> => {
      const db = await getDB();

      // Find and delete the highest set_number for this workout_log_exercise
      const result = await db.query(
        `DELETE FROM workout_sets 
         WHERE id = (
           SELECT id FROM workout_sets 
           WHERE workout_log_exercise_id = $1 
           ORDER BY set_number DESC 
           LIMIT 1
         )
         RETURNING id`,
        [workoutLogExerciseId],
      );

      const deletedId = (result.rows as { id: number }[])[0]?.id;
      if (deletedId) {
        setActiveWorkoutSets((prev) =>
          prev.filter((set) => set.id !== deletedId),
        );
      }
    },
    [],
  );

  // Add a round to a superset (inserts one set for EACH exercise in the superset)
  // All exercises in a superset must have the same number of sets
  const addRoundToSuperset = useCallback(
    async (
      workoutLogId: number,
      supersetGroupId: string,
    ): Promise<WorkoutSet[]> => {
      const db = await getDB();

      // Get all workout_log_exercises in this superset
      const wleResult = await db.query(
        `SELECT wle.*, e.name as exercise_name 
         FROM workout_log_exercises wle
         JOIN exercises e ON wle.exercise_id = e.id
         WHERE wle.workout_log_id = $1 AND wle.superset_group_id = $2
         ORDER BY wle.order_index`,
        [workoutLogId, supersetGroupId],
      );
      const exercises = wleResult.rows as (WorkoutLogExercise & {
        exercise_name: string;
      })[];

      if (exercises.length === 0) return [];

      // Get the current highest set number (should be same for all exercises in superset)
      const countResult = await db.query(
        `SELECT COALESCE(MAX(set_number), 0) as max_set 
         FROM workout_sets 
         WHERE workout_log_exercise_id = $1`,
        [exercises[0].id],
      );
      const maxSet = Number(
        (countResult.rows as { max_set: number }[])[0].max_set,
      );
      const newSetNumber = maxSet + 1;

      // Insert a new set for each exercise in the superset
      const newSets: WorkoutSet[] = [];
      for (const ex of exercises) {
        const result = await db.query(
          `INSERT INTO workout_sets 
           (workout_log_id, exercise_id, workout_log_exercise_id, set_number, reps, weight_kg, duration_seconds, completed_at)
           VALUES ($1, $2, $3, $4, NULL, NULL, NULL, NULL)
           RETURNING *`,
          [workoutLogId, ex.exercise_id, ex.id, newSetNumber],
        );
        const newSet = (result.rows as WorkoutSet[])[0];
        newSets.push(newSet);

        // Update local state
        const setWithExercise: WorkoutSetWithExercise = {
          ...newSet,
          exercise_name: ex.exercise_name,
        };
        setActiveWorkoutSets((prev) => [...prev, setWithExercise]);
      }

      return newSets;
    },
    [],
  );

  // Remove the last round from a superset (deletes from DB for ALL exercises)
  // Must remove the same round number from all exercises in the superset
  const removeRoundFromSuperset = useCallback(
    async (workoutLogId: number, supersetGroupId: string): Promise<void> => {
      const db = await getDB();

      // Get all workout_log_exercises in this superset
      const wleResult = await db.query(
        `SELECT id FROM workout_log_exercises
         WHERE workout_log_id = $1 AND superset_group_id = $2`,
        [workoutLogId, supersetGroupId],
      );
      const exerciseIds = (wleResult.rows as { id: number }[]).map((r) => r.id);

      if (exerciseIds.length === 0) return;

      // Delete the highest set_number for each exercise in the superset
      const deletedIds: number[] = [];
      for (const wleId of exerciseIds) {
        const result = await db.query(
          `DELETE FROM workout_sets 
           WHERE id = (
             SELECT id FROM workout_sets 
             WHERE workout_log_exercise_id = $1 
             ORDER BY set_number DESC 
             LIMIT 1
           )
           RETURNING id`,
          [wleId],
        );
        const deletedId = (result.rows as { id: number }[])[0]?.id;
        if (deletedId) {
          deletedIds.push(deletedId);
        }
      }

      // Update local state
      if (deletedIds.length > 0) {
        setActiveWorkoutSets((prev) =>
          prev.filter((set) => !deletedIds.includes(set.id)),
        );
      }
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

  const resumeWorkout = useCallback(
    async (dateOverride?: string): Promise<WorkoutLog | null> => {
      try {
        const db = await getDB();
        // Find any workout that is still in_progress for the given date (or today)
        // Also handle legacy records where status might be NULL but ended_at is NULL
        const targetDate = dateOverride || getLocalDateString();
        const result = await db.query(
          `SELECT * FROM workout_logs 
           WHERE date = $1 AND (status = 'in_progress' OR (status IS NULL AND ended_at IS NULL))
           ORDER BY started_at DESC
           LIMIT 1`,
          [targetDate],
        );

        if ((result.rows as WorkoutLog[]).length === 0) return null;

        const workout = (result.rows as WorkoutLog[])[0];

        // If status was NULL, update it to 'in_progress' for consistency
        if (!workout.status) {
          await db.query(
            `UPDATE workout_logs SET status = 'in_progress' WHERE id = $1`,
            [workout.id],
          );
          workout.status = 'in_progress';
        }

        setActiveWorkout(workout);
        await loadActiveWorkoutSets(workout.id);
        return workout;
      } catch {
        return null;
      }
    },
    [loadActiveWorkoutSets],
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

  // Add a new exercise to a workout log (for ad-hoc exercises added during workout)
  // Also pre-creates all workout_sets for the exercise
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
    ): Promise<WorkoutLogExercise> => {
      const db = await getDB();
      const targetSets = data.targetSets ?? 3;

      const result = await db.query(
        `INSERT INTO workout_log_exercises 
         (workout_log_id, exercise_id, order_index, superset_group_id, 
          target_sets, target_rep_min, target_rep_max, target_duration_seconds, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          workoutLogId,
          exerciseId,
          data.orderIndex,
          data.supersetGroupId ?? null,
          targetSets,
          data.targetRepMin ?? null,
          data.targetRepMax ?? null,
          data.targetDurationSeconds ?? null,
          data.notes ?? null,
        ],
      );
      const newWorkoutLogExercise = (result.rows as WorkoutLogExercise[])[0];

      // Pre-create all workout_sets for this exercise (empty, with NULL values)
      for (let setNum = 1; setNum <= targetSets; setNum++) {
        await db.query(
          `INSERT INTO workout_sets 
           (workout_log_id, exercise_id, workout_log_exercise_id, set_number, reps, weight_kg, duration_seconds, completed_at)
           VALUES ($1, $2, $3, $4, NULL, NULL, NULL, NULL)`,
          [workoutLogId, exerciseId, newWorkoutLogExercise.id, setNum],
        );
      }

      return newWorkoutLogExercise;
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

  // Delete a workout log exercise (and all its associated sets via cascade)
  const deleteWorkoutLogExercise = useCallback(
    async (workoutLogExerciseId: number): Promise<void> => {
      const db = await getDB();
      await db.query('DELETE FROM workout_log_exercises WHERE id = $1', [
        workoutLogExerciseId,
      ]);
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

  // Mark stale in_progress workouts as incomplete or missed
  // Called on app startup to handle workouts from previous days
  const processStaleWorkouts = useCallback(async (): Promise<void> => {
    try {
      const db = await getDB();
      const today = getLocalDateString();

      // Find all in_progress workouts from before today
      // Also handle legacy records where status might be NULL but ended_at is NULL
      const result = await db.query(
        `SELECT wl.id, 
                (SELECT COUNT(*) FROM workout_sets WHERE workout_log_id = wl.id) as set_count
         FROM workout_logs wl
         WHERE (wl.status = 'in_progress' OR (wl.status IS NULL AND wl.ended_at IS NULL)) 
         AND wl.date < $1`,
        [today],
      );

      const staleWorkouts = result.rows as { id: number; set_count: number }[];

      for (const workout of staleWorkouts) {
        // If has completed sets -> incomplete, otherwise -> missed
        const newStatus: WorkoutStatus =
          Number(workout.set_count) > 0 ? 'incomplete' : 'missed';

        await db.query(`UPDATE workout_logs SET status = $1 WHERE id = $2`, [
          newStatus,
          workout.id,
        ]);
      }
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
  const getTodaySessionStatus = useCallback(
    async (
      sessionId: number,
    ): Promise<{
      hasWorkout: boolean;
      status: WorkoutStatus | null;
      workoutId: number | null;
    }> => {
      try {
        const db = await getDB();
        const today = getLocalDateString();

        const result = await db.query(
          `SELECT id, status, ended_at FROM workout_logs 
           WHERE session_id = $1 AND date = $2
           ORDER BY started_at DESC
           LIMIT 1`,
          [sessionId, today],
        );

        if ((result.rows as WorkoutLog[]).length === 0) {
          return { hasWorkout: false, status: null, workoutId: null };
        }

        const log = (
          result.rows as {
            id: number;
            status: WorkoutStatus | null;
            ended_at: string | null;
          }[]
        )[0];

        // Handle legacy records where status might be NULL
        // Infer status from ended_at for backwards compatibility
        let effectiveStatus: WorkoutStatus | null = log.status;
        if (effectiveStatus === null) {
          effectiveStatus = log.ended_at ? 'completed' : 'in_progress';
        }

        return { hasWorkout: true, status: effectiveStatus, workoutId: log.id };
      } catch {
        return { hasWorkout: false, status: null, workoutId: null };
      }
    },
    [],
  );

  // Get exercise history organized by session for AI coaching analysis
  // Returns array of sessions, each with date and sets for that session
  const getRecentExerciseHistoryBySession = useCallback(
    async (
      exerciseId: number,
      sessionCount = 5,
    ): Promise<{ date: string; sets: WorkoutSet[] }[]> => {
      try {
        const db = await getDB();

        // Get the most recent workout logs that include this exercise
        const logsResult = await db.query(
          `SELECT DISTINCT wl.id, wl.date
           FROM workout_logs wl
           JOIN workout_sets ws ON wl.id = ws.workout_log_id
           WHERE ws.exercise_id = $1 AND (wl.status = 'completed' OR wl.ended_at IS NOT NULL)
           ORDER BY wl.date DESC
           LIMIT $2`,
          [exerciseId, sessionCount],
        );
        const logs = logsResult.rows as { id: number; date: string }[];

        if (logs.length === 0) return [];

        // Get sets for each session separately
        const sessions: { date: string; sets: WorkoutSet[] }[] = [];

        for (const log of logs) {
          const setsResult = await db.query(
            `SELECT * FROM workout_sets
             WHERE workout_log_id = $1 AND exercise_id = $2
             ORDER BY set_number`,
            [log.id, exerciseId],
          );

          sessions.push({
            date: log.date,
            sets: setsResult.rows as WorkoutSet[],
          });
        }

        // Return in chronological order (oldest first, most recent last)
        return sessions.reverse();
      } catch {
        return [];
      }
    },
    [],
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
    completeSet,
    uncompleteSet,
    addSetToExercise,
    removeSetFromExercise,
    addRoundToSuperset,
    removeRoundFromSuperset,
    getWorkoutSets,
    getExerciseHistory,
    getLastPerformance,
    loadActiveWorkoutSets,
    resumeWorkout,
    deleteLog,
    addExerciseNote,
    getExerciseNotes,
    deleteExerciseNote,
    processStaleWorkouts,
    isSessionCompletedToday,
    getTodaySessionStatus,
    getRecentExerciseHistoryBySession,
    // Workout Log Exercises CRUD
    getWorkoutLogExercises,
    addWorkoutLogExercise,
    updateWorkoutLogExercise,
    deleteWorkoutLogExercise,
    reorderWorkoutLogExercises,
  };
}
