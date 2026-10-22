import { useCallback, useState } from 'react';
import {
  generateWorkoutProgramWithFunctionCalling,
  inferExperienceLevelLocally,
} from '../services/coaching/programCoach';
import { getDB } from '../services/db';
import type {
  AIExerciseResponse,
  AIProgramGeneratorInputV2,
  AIProgramGeneratorResponse,
  Exercise,
  ExperienceLevelInference,
} from '../types';

// Generation only: the hook returns a draft for the program editor, which
// resolves the exercises and owns saving.
//   idle -> inferring_experience -> generating_program -> complete
// Any step can transition to 'error'; reset() returns to 'idle'.
type GeneratorStep =
  | 'idle'
  | 'inferring_experience'
  | 'generating_program'
  | 'complete'
  | 'error';

interface GeneratorState {
  step: GeneratorStep;
  progress: string;
  error: string | null;
  inferredExperience: ExperienceLevelInference | null;
}

export interface GeneratedDraft {
  program: AIProgramGeneratorResponse;
  /** Details the AI wrote for exercises it added (resolver input). */
  exercisesToCreate: AIExerciseResponse[];
  recommendations: string[];
}

const INITIAL_STATE: GeneratorState = {
  step: 'idle',
  progress: '',
  error: null,
  inferredExperience: null,
};

export function useProgramGenerator() {
  const [state, setState] = useState<GeneratorState>(INITIAL_STATE);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  /**
   * Fetch workout history summary for experience level inference
   */
  const fetchWorkoutHistorySummary = useCallback(async () => {
    const db = await getDB();

    // Get workout count and date range
    const workoutStats = await db.query(`
      SELECT 
        COUNT(*) as total_workouts,
        MIN(date) as first_workout,
        MAX(date) as last_workout
      FROM workout_logs 
      WHERE status = 'completed'
    `);
    const statsRow = workoutStats.rows[0] as {
      total_workouts: string | number | null;
      first_workout: string | null;
      last_workout: string | null;
    };

    // Parse total_workouts as number (DB might return string or bigint)
    const totalWorkouts = Number(statsRow.total_workouts) || 0;

    if (totalWorkouts === 0) {
      return null; // No history
    }

    // Calculate weeks of training
    const weeks =
      statsRow.first_workout && statsRow.last_workout
        ? Math.max(
            1,
            Math.ceil(
              (new Date(statsRow.last_workout).getTime() -
                new Date(statsRow.first_workout).getTime()) /
                (1000 * 60 * 60 * 24 * 7),
            ),
          )
        : 0;

    // Get average exercises and sets per session
    const avgStats = await db.query(`
      SELECT 
        AVG(exercise_count) as avg_exercises,
        AVG(set_count) as avg_sets
      FROM (
        SELECT 
          wl.id,
          COUNT(DISTINCT wle.exercise_id) as exercise_count,
          COUNT(ws.id) as set_count
        FROM workout_logs wl
        LEFT JOIN workout_log_exercises wle ON wle.workout_log_id = wl.id
        LEFT JOIN workout_sets ws ON ws.workout_log_id = wl.id
        WHERE wl.status = 'completed'
        GROUP BY wl.id
      ) session_stats
    `);
    const avgRow = avgStats.rows[0] as {
      avg_exercises: string | number | null;
      avg_sets: string | number | null;
    };

    // Parse averages as numbers (DB might return string or decimal)
    const avgExercisesPerSession = Number(avgRow.avg_exercises) || 0;
    const avgSetsPerSession = Number(avgRow.avg_sets) || 0;

    // Check if supersets have been used
    const supersetCheck = await db.query(`
      SELECT COUNT(*) as superset_count
      FROM workout_log_exercises
      WHERE superset_group_id IS NOT NULL
    `);
    const supersetRow = supersetCheck.rows[0] as {
      superset_count: string | number | null;
    };
    const hasUsedSupersets = Number(supersetRow.superset_count) > 0;

    // Get top exercises
    const topExercisesResult = await db.query(`
      SELECT e.name, COUNT(*) as usage_count
      FROM workout_sets ws
      JOIN exercises e ON e.id = ws.exercise_id
      GROUP BY e.id, e.name
      ORDER BY usage_count DESC
      LIMIT 20
    `);
    const topExercises = (topExercisesResult.rows as { name: string }[]).map(
      (r) => r.name,
    );

    return {
      totalWorkouts,
      totalWeeks: weeks,
      avgExercisesPerSession,
      avgSetsPerSession,
      hasUsedSupersets,
      topExercises,
    };
  }, []);

  /**
   * Generate a program draft with function calling (the AI selects library
   * exercises and describes new ones in one pass). Resolves to null on error;
   * the cause is in state.error.
   */
  const generate = useCallback(
    async (
      input: AIProgramGeneratorInputV2,
    ): Promise<GeneratedDraft | null> => {
      try {
        setState({
          ...INITIAL_STATE,
          step: 'generating_program',
          progress: 'Reading your exercise library...',
        });

        const db = await getDB();
        const existing = await db.query<Exercise>(
          'SELECT * FROM exercises WHERE archived_at IS NULL ORDER BY name',
        );

        // Experience: the user's choice, else inferred from history locally.
        let workoutHistory = input.workoutHistory;
        let experienceLevel = input.experienceLevel;
        if (!experienceLevel && !workoutHistory) {
          setState((prev) => ({
            ...prev,
            step: 'inferring_experience',
            progress: 'Looking at your workout history...',
          }));
          workoutHistory = (await fetchWorkoutHistorySummary()) || undefined;
        }
        if (!experienceLevel && workoutHistory) {
          const inference = inferExperienceLevelLocally(workoutHistory);
          experienceLevel = inference.inferredLevel;
          setState((prev) => ({ ...prev, inferredExperience: inference }));
        }

        setState((prev) => ({
          ...prev,
          step: 'generating_program',
          progress: 'Building your sessions. This can take a minute...',
        }));

        const result = await generateWorkoutProgramWithFunctionCalling(
          { ...input, experienceLevel, workoutHistory },
          existing.rows,
        );

        setState((prev) => ({
          ...prev,
          step: 'complete',
          progress: '',
          inferredExperience:
            result.inferredExperienceLevel ?? prev.inferredExperience,
        }));
        return {
          program: result.program,
          exercisesToCreate: result.exercisesToCreate,
          recommendations: result.program.recommendations ?? [],
        };
      } catch (err) {
        console.error('Program generation error:', err);
        setState((prev) => ({
          ...prev,
          step: 'error',
          progress: '',
          error:
            err instanceof Error ? err.message : 'Failed to generate program',
        }));
        return null;
      }
    },
    [fetchWorkoutHistorySummary],
  );

  return { state, generate, reset };
}
