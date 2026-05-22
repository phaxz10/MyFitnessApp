import { useCallback, useState } from 'react';
import { getDB } from '../services/db';
import {
  findDuplicateExercises,
  generateExerciseDetailsBatch,
} from '../services/coaching/exerciseLibraryCoach';
import {
  generateWorkoutProgram,
  generateWorkoutProgramWithFunctionCalling,
  inferExperienceLevel,
  type StreamlinedProgramResult,
} from '../services/coaching/programCoach';
import type {
  AIExerciseResponse,
  AIProgramGeneratorInput,
  AIProgramGeneratorInputV2,
  AIProgramGeneratorResponse,
  Exercise,
  ExperienceLevelInference,
} from '../types';

export type GeneratorStep =
  | 'idle'
  | 'inferring_experience' // New: inferring experience level
  | 'generating_program'
  | 'checking_exercises'
  | 'generating_exercise_details'
  | 'saving_exercises'
  | 'saving_program'
  | 'complete'
  | 'error';

export interface ExerciseMapping {
  originalName: string;
  exerciseId: number | null; // null if needs to be created
  existingExercise: Exercise | null;
  duplicateOf: Exercise | null; // if AI found a duplicate
  aiDetails: AIExerciseResponse | null;
  status:
    | 'pending'
    | 'matched'
    | 'duplicate_found'
    | 'needs_creation'
    | 'created';
}

export interface GeneratorState {
  step: GeneratorStep;
  progress: string;
  generatedProgram: AIProgramGeneratorResponse | null;
  exerciseMappings: ExerciseMapping[];
  error: string | null;
  // New: Experience level inference
  inferredExperience: ExperienceLevelInference | null;
  // New: Track if this is the only program (for auto-activation)
  isOnlyProgram: boolean;
  // New: Streamlined result from function calling
  streamlinedResult: StreamlinedProgramResult | null;
}

const INITIAL_STATE: GeneratorState = {
  step: 'idle',
  progress: '',
  generatedProgram: null,
  exerciseMappings: [],
  error: null,
  inferredExperience: null,
  isOnlyProgram: false,
  streamlinedResult: null,
};

export function useProgramGenerator() {
  const [state, setState] = useState<GeneratorState>(INITIAL_STATE);

  const resetState = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  // Fetch all existing exercises from DB
  const fetchExistingExercises = useCallback(async (): Promise<Exercise[]> => {
    const db = await getDB();
    const result = await db.query('SELECT * FROM exercises ORDER BY name');
    return result.rows as Exercise[];
  }, []);

  // Extract unique exercise names from AI-generated program
  const extractUniqueExercises = useCallback(
    (program: AIProgramGeneratorResponse): string[] => {
      const exerciseSet = new Set<string>();
      for (const session of program.sessions) {
        for (const exercise of session.exercises) {
          exerciseSet.add(exercise.name);
        }
      }
      return Array.from(exerciseSet);
    },
    [],
  );

  // Find exact match in existing exercises (case-insensitive)
  const findExactMatch = useCallback(
    (name: string, existingExercises: Exercise[]): Exercise | null => {
      const lowerName = name.toLowerCase().trim();
      return (
        existingExercises.find(
          (ex) => ex.name.toLowerCase().trim() === lowerName,
        ) || null
      );
    },
    [],
  );

  // Main generation function
  const generateProgram = useCallback(
    async (input: AIProgramGeneratorInput): Promise<void> => {
      try {
        // Step 1: Generate the workout program
        setState((prev) => ({
          ...prev,
          step: 'generating_program',
          progress: 'Creating your personalized workout program...',
          error: null,
        }));

        const existingExercises = await fetchExistingExercises();
        const generatedProgram = await generateWorkoutProgram(
          input,
          existingExercises,
        );

        setState((prev) => ({
          ...prev,
          generatedProgram,
          progress: 'Program created! Checking exercise library...',
        }));

        // Step 2: Check which exercises exist and which need to be created
        setState((prev) => ({
          ...prev,
          step: 'checking_exercises',
          progress: 'Checking exercise library for matches...',
        }));

        const uniqueExerciseNames = extractUniqueExercises(generatedProgram);
        const mappings: ExerciseMapping[] = [];

        for (const exerciseName of uniqueExerciseNames) {
          // First, check for exact match
          const exactMatch = findExactMatch(exerciseName, existingExercises);

          if (exactMatch) {
            mappings.push({
              originalName: exerciseName,
              exerciseId: exactMatch.id,
              existingExercise: exactMatch,
              duplicateOf: null,
              aiDetails: null,
              status: 'matched',
            });
          } else {
            // Check for duplicates using AI
            const duplicates = await findDuplicateExercises(
              exerciseName,
              existingExercises,
            );

            if (duplicates.length > 0) {
              // Use the first duplicate as the match
              mappings.push({
                originalName: exerciseName,
                exerciseId: duplicates[0].id,
                existingExercise: duplicates[0],
                duplicateOf: duplicates[0],
                aiDetails: null,
                status: 'duplicate_found',
              });
            } else {
              // Exercise doesn't exist, needs creation
              mappings.push({
                originalName: exerciseName,
                exerciseId: null,
                existingExercise: null,
                duplicateOf: null,
                aiDetails: null,
                status: 'needs_creation',
              });
            }
          }
        }

        setState((prev) => ({
          ...prev,
          exerciseMappings: mappings,
        }));

        // Step 3: Generate details for exercises that need creation
        const exercisesNeedingCreation = mappings.filter(
          (m) => m.status === 'needs_creation',
        );

        if (exercisesNeedingCreation.length > 0) {
          setState((prev) => ({
            ...prev,
            step: 'generating_exercise_details',
            progress: `Generating details for ${exercisesNeedingCreation.length} new exercises...`,
          }));

          const exerciseNames = exercisesNeedingCreation.map(
            (m) => m.originalName,
          );
          const aiDetails = await generateExerciseDetailsBatch(exerciseNames);

          // Map AI details back to mappings
          const updatedMappings = mappings.map((mapping) => {
            if (mapping.status !== 'needs_creation') return mapping;

            const detailIndex = exerciseNames.indexOf(mapping.originalName);
            if (detailIndex !== -1 && aiDetails[detailIndex]) {
              return {
                ...mapping,
                aiDetails: aiDetails[detailIndex],
              };
            }
            return mapping;
          });

          setState((prev) => ({
            ...prev,
            exerciseMappings: updatedMappings,
          }));
        }

        setState((prev) => ({
          ...prev,
          step: 'complete',
          progress: 'Program ready for review!',
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          step: 'error',
          error:
            err instanceof Error ? err.message : 'Failed to generate program',
        }));
      }
    },
    [fetchExistingExercises, extractUniqueExercises, findExactMatch],
  );

  // Allow user to override duplicate detection (use AI suggestion or create new)
  const overrideDuplicateMapping = useCallback(
    (
      originalName: string,
      useExisting: boolean,
      existingExercise?: Exercise,
    ) => {
      setState((prev) => {
        const updatedMappings = prev.exerciseMappings.map((mapping) => {
          if (mapping.originalName !== originalName) return mapping;

          if (useExisting && existingExercise) {
            return {
              ...mapping,
              exerciseId: existingExercise.id,
              existingExercise,
              status: 'matched' as const,
            };
          } else {
            return {
              ...mapping,
              exerciseId: null,
              existingExercise: null,
              duplicateOf: null,
              status: 'needs_creation' as const,
            };
          }
        });

        return { ...prev, exerciseMappings: updatedMappings };
      });
    },
    [],
  );

  // Save the program to the database
  const saveProgram = useCallback(async (): Promise<number | null> => {
    if (!state.generatedProgram) return null;

    try {
      setState((prev) => ({
        ...prev,
        step: 'saving_exercises',
        progress: 'Saving new exercises to library...',
      }));

      const db = await getDB();

      // First, create any exercises that need creation
      const exercisesToCreate = state.exerciseMappings.filter(
        (m) => m.status === 'needs_creation' && m.aiDetails,
      );

      const updatedMappings = [...state.exerciseMappings];

      for (const mapping of exercisesToCreate) {
        if (!mapping.aiDetails) continue;

        const result = await db.query(
          `INSERT INTO exercises (name, description, muscle_groups, equipment, video_url, exercise_type, is_ai_generated)
           VALUES ($1, $2, $3, $4, $5, $6, true)
           RETURNING id`,
          [
            mapping.aiDetails.name,
            mapping.aiDetails.description,
            mapping.aiDetails.muscle_groups.join(', '),
            mapping.aiDetails.equipment,
            null, // video_url
            mapping.aiDetails.exercise_type,
          ],
        );

        const rows = result.rows as { id: number }[];
        const newId = rows[0].id;

        // Update the mapping with the new ID
        const mappingIndex = updatedMappings.findIndex(
          (m) => m.originalName === mapping.originalName,
        );
        if (mappingIndex !== -1) {
          updatedMappings[mappingIndex] = {
            ...updatedMappings[mappingIndex],
            exerciseId: newId,
            status: 'created',
          };
        }
      }

      setState((prev) => ({
        ...prev,
        exerciseMappings: updatedMappings,
        step: 'saving_program',
        progress: 'Creating workout program...',
      }));

      // Create the program
      const programResult = await db.query(
        `INSERT INTO workout_programs (name, description, sessions_per_week, is_active)
         VALUES ($1, $2, $3, false)
         RETURNING id`,
        [
          state.generatedProgram.programName,
          state.generatedProgram.programDescription,
          state.generatedProgram.sessions.length,
        ],
      );

      const programRows = programResult.rows as { id: number }[];
      const programId = programRows[0].id;

      // Create sessions and exercises
      for (
        let sessionIndex = 0;
        sessionIndex < state.generatedProgram.sessions.length;
        sessionIndex++
      ) {
        const session = state.generatedProgram.sessions[sessionIndex];

        const sessionResult = await db.query(
          `INSERT INTO program_sessions (program_id, name, day_of_week, order_index)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [programId, session.name, session.dayOfWeek, sessionIndex],
        );

        const sessionRows = sessionResult.rows as { id: number }[];
        const sessionId = sessionRows[0].id;

        // Track supersets for grouping
        const supersetGroups: Map<string, string> = new Map();

        for (
          let exerciseIndex = 0;
          exerciseIndex < session.exercises.length;
          exerciseIndex++
        ) {
          const exercise = session.exercises[exerciseIndex];

          // Find the exercise ID from our mappings
          const mapping = updatedMappings.find(
            (m) => m.originalName === exercise.name,
          );

          if (!mapping || !mapping.exerciseId) {
            console.warn(
              `Could not find exercise mapping for: ${exercise.name}`,
            );
            continue;
          }

          // Handle superset grouping
          let supersetGroupId: string | null = null;
          if (exercise.supersetWith) {
            // Check if the paired exercise already has a group
            const existingGroup = supersetGroups.get(exercise.supersetWith);
            if (existingGroup) {
              supersetGroupId = existingGroup;
            } else {
              // Create a new group
              supersetGroupId = `ss_${sessionId}_${exerciseIndex}`;
              supersetGroups.set(exercise.name, supersetGroupId);
              supersetGroups.set(exercise.supersetWith, supersetGroupId);
            }
          }

          await db.query(
            `INSERT INTO program_exercises (session_id, exercise_id, target_sets, target_rep_min, target_rep_max, target_duration_seconds, order_index, superset_group_id, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              sessionId,
              mapping.exerciseId,
              exercise.targetSets,
              exercise.targetRepMin,
              exercise.targetRepMax,
              exercise.targetDurationSeconds || null,
              exerciseIndex,
              supersetGroupId,
              exercise.notes || null,
            ],
          );
        }
      }

      setState((prev) => ({
        ...prev,
        step: 'complete',
        progress: 'Program saved successfully!',
      }));

      return programId;
    } catch (err) {
      setState((prev) => ({
        ...prev,
        step: 'error',
        error: err instanceof Error ? err.message : 'Failed to save program',
      }));
      return null;
    }
  }, [state.generatedProgram, state.exerciseMappings]);

  // ============================================================================
  // NEW STREAMLINED GENERATION FLOW WITH FUNCTION CALLING
  // ============================================================================

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
   * Check how many programs exist (for auto-activation logic)
   */
  const checkProgramCount = useCallback(async (): Promise<number> => {
    const db = await getDB();
    const result = await db.query(
      'SELECT COUNT(*) as count FROM workout_programs',
    );
    return (result.rows[0] as { count: number }).count;
  }, []);

  /**
   * Streamlined program generation using OpenAI function calling.
   * This approach:
   * 1. Optionally infers experience level from workout history
   * 2. Lets AI select/create exercises in one pass
   * 3. Generates the complete program with proper supersets
   */
  const generateProgramStreamlined = useCallback(
    async (input: AIProgramGeneratorInputV2): Promise<void> => {
      try {
        // Check if this will be the only program
        const programCount = await checkProgramCount();
        const isOnlyProgram = programCount === 0;

        setState((prev) => ({
          ...prev,
          step: 'generating_program',
          progress: 'Creating your personalized workout program...',
          error: null,
          isOnlyProgram,
        }));

        // Fetch existing exercises
        const existingExercises = await fetchExistingExercises();

        // Optionally fetch workout history for experience inference
        let workoutHistory = input.workoutHistory;
        if (!input.experienceLevel && !workoutHistory) {
          setState((prev) => ({
            ...prev,
            step: 'inferring_experience',
            progress: 'Analyzing your workout history...',
          }));
          workoutHistory = (await fetchWorkoutHistorySummary()) || undefined;
        }

        // If we still don't have experience level and no history, infer from other signals
        let experienceLevel = input.experienceLevel;
        if (!experienceLevel && workoutHistory) {
          // Use standalone inference for better experience
          const inference = await inferExperienceLevel(workoutHistory);
          experienceLevel = inference.inferredLevel;
          setState((prev) => ({
            ...prev,
            inferredExperience: inference,
            progress: `Experience level: ${inference.inferredLevel}. Generating program...`,
          }));
        }

        setState((prev) => ({
          ...prev,
          step: 'generating_program',
          progress:
            'AI is creating your program with optimal exercise selection...',
        }));

        // Use function calling for streamlined generation
        const result = await generateWorkoutProgramWithFunctionCalling(
          {
            ...input,
            experienceLevel,
            workoutHistory,
          },
          existingExercises,
        );

        // Process the result - build exercise mappings
        const mappings: ExerciseMapping[] = [];

        // Map selected exercises
        for (const selected of result.selectedExercises) {
          const existingEx = existingExercises.find(
            (ex) => ex.name.toLowerCase() === selected.name.toLowerCase(),
          );
          if (existingEx) {
            mappings.push({
              originalName: selected.name,
              exerciseId: existingEx.id,
              existingExercise: existingEx,
              duplicateOf: null,
              aiDetails: null,
              status: 'matched',
            });
          }
        }

        // Map exercises to create
        for (const toCreate of result.exercisesToCreate) {
          mappings.push({
            originalName: toCreate.name,
            exerciseId: null,
            existingExercise: null,
            duplicateOf: null,
            aiDetails: toCreate,
            status: 'needs_creation',
          });
        }

        setState((prev) => ({
          ...prev,
          step: 'complete',
          progress: 'Program ready for review!',
          generatedProgram: result.program,
          exerciseMappings: mappings,
          streamlinedResult: result,
          inferredExperience:
            result.inferredExperienceLevel || prev.inferredExperience,
        }));
      } catch (err) {
        console.error('Streamlined generation error:', err);
        setState((prev) => ({
          ...prev,
          step: 'error',
          error:
            err instanceof Error ? err.message : 'Failed to generate program',
        }));
      }
    },
    [fetchExistingExercises, fetchWorkoutHistorySummary, checkProgramCount],
  );

  /**
   * Save program with auto-activation logic.
   * If this is the only program, automatically set it as active.
   * Otherwise, return the program ID for the UI to handle.
   */
  const saveProgramWithAutoActivation = useCallback(
    async (
      autoActivate?: boolean,
    ): Promise<{
      programId: number | null;
      wasAutoActivated: boolean;
    }> => {
      const programId = await saveProgram();
      if (!programId) {
        return { programId: null, wasAutoActivated: false };
      }

      const shouldAutoActivate = autoActivate ?? state.isOnlyProgram;

      if (shouldAutoActivate) {
        const db = await getDB();
        // Deactivate all other programs
        await db.query('UPDATE workout_programs SET is_active = false');
        // Activate this program
        await db.query(
          'UPDATE workout_programs SET is_active = true WHERE id = $1',
          [programId],
        );
        return { programId, wasAutoActivated: true };
      }

      return { programId, wasAutoActivated: false };
    },
    [saveProgram, state.isOnlyProgram],
  );

  return {
    state,
    generateProgram,
    generateProgramStreamlined,
    saveProgram,
    saveProgramWithAutoActivation,
    overrideDuplicateMapping,
    resetState,
    checkProgramCount,
  };
}
