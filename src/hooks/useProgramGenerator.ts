import { useState, useCallback } from 'react';
import { getDB } from '../services/db';
import {
  generateWorkoutProgram,
  generateExerciseDetailsBatch,
  findDuplicateExercises,
} from '../services/gemini';
import type {
  AIProgramGeneratorInput,
  AIProgramGeneratorResponse,
  Exercise,
  AIExerciseResponse,
} from '../types';

export type GeneratorStep =
  | 'idle'
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
}

export function useProgramGenerator() {
  const [state, setState] = useState<GeneratorState>({
    step: 'idle',
    progress: '',
    generatedProgram: null,
    exerciseMappings: [],
    error: null,
  });

  const resetState = useCallback(() => {
    setState({
      step: 'idle',
      progress: '',
      generatedProgram: null,
      exerciseMappings: [],
      error: null,
    });
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

  return {
    state,
    generateProgram,
    saveProgram,
    overrideDuplicateMapping,
    resetState,
  };
}
