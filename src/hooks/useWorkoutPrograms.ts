import { useState, useCallback } from 'react';
import { getDB } from '../services/db';
import type {
  WorkoutProgram,
  ProgramSession,
  ProgramExercise,
  ProgramSessionWithExercises,
  WorkoutProgramWithSessions,
  ProgramExerciseWithDetails,
} from '../types';

export function useWorkoutPrograms() {
  const [programs, setPrograms] = useState<WorkoutProgram[]>([]);
  const [activeProgram, setActiveProgram] =
    useState<WorkoutProgramWithSessions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPrograms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const db = await getDB();
      const result = await db.query(
        'SELECT * FROM workout_programs ORDER BY created_at DESC',
      );
      setPrograms(result.rows as WorkoutProgram[]);
      return result.rows as WorkoutProgram[];
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch programs');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchActiveProgram =
    useCallback(async (): Promise<WorkoutProgramWithSessions | null> => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();

        // Get active program
        const programResult = await db.query(
          'SELECT * FROM workout_programs WHERE is_active = true LIMIT 1',
        );
        const programs = programResult.rows as WorkoutProgram[];

        if (programs.length === 0) {
          setActiveProgram(null);
          return null;
        }

        const program = programs[0];

        // Get sessions for this program
        const sessionsResult = await db.query(
          'SELECT * FROM program_sessions WHERE program_id = $1 ORDER BY order_index',
          [program.id],
        );
        const sessions = sessionsResult.rows as ProgramSession[];

        // Get exercises for each session
        const sessionsWithExercises: ProgramSessionWithExercises[] =
          await Promise.all(
            sessions.map(async (session) => {
              const exercisesResult = await db.query(
                `SELECT pe.*, e.name as exercise_name, e.description as exercise_description, 
                    e.muscle_groups, e.equipment, e.exercise_type
             FROM program_exercises pe
             JOIN exercises e ON pe.exercise_id = e.id
             WHERE pe.session_id = $1
             ORDER BY pe.order_index`,
                [session.id],
              );
              return {
                ...session,
                exercises: exercisesResult.rows as ProgramExerciseWithDetails[],
              };
            }),
          );

        const fullProgram: WorkoutProgramWithSessions = {
          ...program,
          sessions: sessionsWithExercises,
        };

        setActiveProgram(fullProgram);
        return fullProgram;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to fetch active program',
        );
        return null;
      } finally {
        setLoading(false);
      }
    }, []);

  const getProgramById = useCallback(
    async (id: number): Promise<WorkoutProgramWithSessions | null> => {
      try {
        const db = await getDB();

        const programResult = await db.query(
          'SELECT * FROM workout_programs WHERE id = $1',
          [id],
        );
        const programs = programResult.rows as WorkoutProgram[];

        if (programs.length === 0) return null;

        const program = programs[0];

        const sessionsResult = await db.query(
          'SELECT * FROM program_sessions WHERE program_id = $1 ORDER BY order_index',
          [program.id],
        );
        const sessions = sessionsResult.rows as ProgramSession[];

        const sessionsWithExercises: ProgramSessionWithExercises[] =
          await Promise.all(
            sessions.map(async (session) => {
              const exercisesResult = await db.query(
                `SELECT pe.*, e.name as exercise_name, e.description as exercise_description, 
                    e.muscle_groups, e.equipment, e.exercise_type
             FROM program_exercises pe
             JOIN exercises e ON pe.exercise_id = e.id
             WHERE pe.session_id = $1
             ORDER BY pe.order_index`,
                [session.id],
              );
              return {
                ...session,
                exercises: exercisesResult.rows as ProgramExerciseWithDetails[],
              };
            }),
          );

        return {
          ...program,
          sessions: sessionsWithExercises,
        };
      } catch {
        return null;
      }
    },
    [],
  );

  const createProgram = useCallback(
    async (
      program: Omit<
        WorkoutProgram,
        'id' | 'created_at' | 'updated_at' | 'is_active'
      >,
    ): Promise<number> => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        const result = await db.query(
          `INSERT INTO workout_programs (name, description, sessions_per_week, is_active)
         VALUES ($1, $2, $3, false)
         RETURNING id`,
          [program.name, program.description, program.sessions_per_week],
        );
        await fetchPrograms();
        const rows = result.rows as { id: number }[];
        return rows[0].id;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to create program',
        );
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchPrograms],
  );

  const updateProgram = useCallback(
    async (id: number, data: Partial<WorkoutProgram>) => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        const fields: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        Object.entries(data).forEach(([key, value]) => {
          if (key !== 'id' && key !== 'created_at' && value !== undefined) {
            fields.push(`${key} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
          }
        });

        if (fields.length > 0) {
          fields.push('updated_at = CURRENT_TIMESTAMP');
          values.push(id);
          await db.query(
            `UPDATE workout_programs SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
            values,
          );
          await fetchPrograms();
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to update program',
        );
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchPrograms],
  );

  const deleteProgram = useCallback(
    async (id: number) => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        await db.query('DELETE FROM workout_programs WHERE id = $1', [id]);
        await fetchPrograms();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to delete program',
        );
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchPrograms],
  );

  const setActiveProgramById = useCallback(
    async (id: number) => {
      setLoading(true);
      setError(null);
      try {
        const db = await getDB();
        // Deactivate all programs
        await db.query('UPDATE workout_programs SET is_active = false');
        // Activate the selected one
        await db.query(
          'UPDATE workout_programs SET is_active = true WHERE id = $1',
          [id],
        );
        await fetchPrograms();
        await fetchActiveProgram();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to set active program',
        );
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchPrograms, fetchActiveProgram],
  );

  // Session management
  const addSession = useCallback(
    async (
      programId: number,
      session: Omit<ProgramSession, 'id' | 'program_id' | 'created_at'>,
    ): Promise<number> => {
      const db = await getDB();
      const result = await db.query(
        `INSERT INTO program_sessions (program_id, name, day_of_week, order_index)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [programId, session.name, session.day_of_week, session.order_index],
      );
      const rows = result.rows as { id: number }[];
      return rows[0].id;
    },
    [],
  );

  const updateSession = useCallback(
    async (id: number, data: Partial<ProgramSession>) => {
      const db = await getDB();
      const fields: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      Object.entries(data).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'created_at' && value !== undefined) {
          fields.push(`${key} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      });

      if (fields.length > 0) {
        values.push(id);
        await db.query(
          `UPDATE program_sessions SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
          values,
        );
      }
    },
    [],
  );

  const deleteSession = useCallback(async (id: number) => {
    const db = await getDB();
    await db.query('DELETE FROM program_sessions WHERE id = $1', [id]);
  }, []);

  // Program exercise management
  const addProgramExercise = useCallback(
    async (
      sessionId: number,
      exercise: Omit<ProgramExercise, 'id' | 'session_id'>,
    ): Promise<number> => {
      const db = await getDB();
      const result = await db.query(
        `INSERT INTO program_exercises (session_id, exercise_id, target_sets, target_rep_min, target_rep_max, target_duration_seconds, order_index, superset_group_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          sessionId,
          exercise.exercise_id,
          exercise.target_sets,
          exercise.target_rep_min,
          exercise.target_rep_max,
          exercise.target_duration_seconds,
          exercise.order_index,
          exercise.superset_group_id,
          exercise.notes,
        ],
      );
      const rows = result.rows as { id: number }[];
      return rows[0].id;
    },
    [],
  );

  const updateProgramExercise = useCallback(
    async (id: number, data: Partial<ProgramExercise>) => {
      const db = await getDB();
      const fields: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      Object.entries(data).forEach(([key, value]) => {
        if (key !== 'id' && value !== undefined) {
          fields.push(`${key} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      });

      if (fields.length > 0) {
        values.push(id);
        await db.query(
          `UPDATE program_exercises SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
          values,
        );
      }
    },
    [],
  );

  const deleteProgramExercise = useCallback(async (id: number) => {
    const db = await getDB();
    await db.query('DELETE FROM program_exercises WHERE id = $1', [id]);
  }, []);

  return {
    programs,
    activeProgram,
    loading,
    error,
    fetchPrograms,
    fetchActiveProgram,
    getProgramById,
    createProgram,
    updateProgram,
    deleteProgram,
    setActiveProgramById,
    addSession,
    updateSession,
    deleteSession,
    addProgramExercise,
    updateProgramExercise,
    deleteProgramExercise,
  };
}
