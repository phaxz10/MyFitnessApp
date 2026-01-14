import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Exercise,
  ExerciseType,
  WorkoutLogExerciseWithDetails,
  WorkoutSet,
} from '../types';
import { useExercises } from './useExercises';
import { useWorkoutLogs } from './useWorkoutLogs';

export interface SetData {
  id: number; // Database ID - always present since sets are pre-created
  set_number: number;
  reps: string;
  weight: string;
  durationSeconds: string;
  completed: boolean; // Based on completed_at IS NOT NULL
  // Placeholder values for new sets (from last performance or targets)
  placeholderReps?: string;
  placeholderWeight?: string;
  placeholderDuration?: string;
}

export interface ExerciseWithSets {
  workoutLogExercise: WorkoutLogExerciseWithDetails; // Source of truth from DB
  exercise: Exercise; // Master exercise data
  exerciseType: ExerciseType;
  sets: SetData[];
  lastPerformance: WorkoutSet[] | null;
  isExpanded: boolean;
  notes: string;
}

// Debounce helper for auto-saving field changes
function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// Helper to parse weight - always returns a number, never null
function parseWeight(value: string | undefined | null): number {
  if (!value || value === '') return 0;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
}

// Helper to parse reps - can be null for duration exercises
function parseReps(value: string | undefined | null): number | null {
  if (!value || value === '') return null;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? null : parsed;
}

// Helper to parse duration - can be null for non-duration exercises
function parseDuration(value: string | undefined | null): number | null {
  if (!value || value === '') return null;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? null : parsed;
}

export function useWorkoutSession(dateOverride?: string) {
  const {
    activeWorkout,
    resumeWorkout,
    endWorkout,
    cancelWorkout,
    updateSet,
    completeSet,
    uncompleteSet,
    addSetToExercise,
    removeSetFromExercise,
    addRoundToSuperset,
    removeRoundFromSuperset,
    getWorkoutSets,
    getLastPerformance,
    getWorkoutLogExercises,
    addWorkoutLogExercise,
    deleteWorkoutLogExercise,
    updateWorkoutLogExercise,
  } = useWorkoutLogs();

  const { exercises: allExercises, fetchExercises } = useExercises();

  const [exercisesWithSets, setExercisesWithSets] = useState<
    ExerciseWithSets[]
  >([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Loading states for async operations
  // Keys are formatted as: "action:exerciseIndex:setIndex" or "action:exerciseIndex" or just "action"
  const [loadingStates, setLoadingStates] = useState<Set<string>>(new Set());

  // Helper to set loading state
  const setLoading = useCallback((key: string, isLoading: boolean) => {
    setLoadingStates((prev) => {
      const next = new Set(prev);
      if (isLoading) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  // Helper to check if a specific operation is loading
  const isLoading = useCallback(
    (key: string) => loadingStates.has(key),
    [loadingStates],
  );

  // Ref to always have current state (fixes stale closure issues)
  const exercisesRef = useRef<ExerciseWithSets[]>([]);
  useEffect(() => {
    exercisesRef.current = exercisesWithSets;
  }, [exercisesWithSets]);

  // Track whether exercises have been initialized from DB (only do this once!)
  const hasInitializedExercises = useRef(false);

  // Track pending saves to prevent race conditions
  const pendingSaves = useRef<Map<string, Promise<void>>>(new Map());

  // Initialize session on mount
  useEffect(() => {
    const init = async () => {
      await resumeWorkout(dateOverride);
      await fetchExercises();
      setIsInitialized(true);
    };
    init();
  }, [resumeWorkout, fetchExercises, dateOverride]);

  // Initialize exercises from workout_log_exercises and load pre-created sets
  useEffect(() => {
    const initExercises = async () => {
      if (!activeWorkout || !isInitialized) return;
      if (!allExercises.length) return; // Wait for exercises to load

      // Only initialize once! After that, local state is the source of truth
      if (hasInitializedExercises.current) return;
      hasInitializedExercises.current = true;

      // Get workout log exercises (structure)
      const workoutLogExercises = await getWorkoutLogExercises(
        activeWorkout.id,
      );

      // Get all workout sets (pre-created, may have values or be empty)
      const allSets = await getWorkoutSets(activeWorkout.id);

      // Group sets by workout_log_exercise_id
      const setsByWorkoutLogExercise = allSets.reduce(
        (acc, set) => {
          const key =
            set.workout_log_exercise_id ?? `exercise-${set.exercise_id}`;
          if (!acc[key]) {
            acc[key] = [];
          }
          acc[key].push(set);
          return acc;
        },
        {} as Record<string | number, typeof allSets>,
      );

      if (workoutLogExercises.length > 0) {
        const exercisesDataRaw = await Promise.all(
          workoutLogExercises.map(async (wle) => {
            const masterExercise = allExercises.find(
              (e) => e.id === wle.exercise_id,
            );
            if (!masterExercise) {
              return null;
            }

            const lastPerf = await getLastPerformance(
              wle.exercise_id,
              activeWorkout.id,
            );
            const exerciseType = wle.exercise_type || 'reps_weight';
            const isDuration =
              exerciseType === 'duration' || exerciseType === 'duration_weight';

            // Get pre-created sets for this workout_log_exercise
            const dbSets = setsByWorkoutLogExercise[wle.id] || [];

            // Convert DB sets to SetData format
            // Sets are pre-created, so they all have IDs
            // completed = completed_at IS NOT NULL
            const sets: SetData[] = dbSets
              .sort((a, b) => a.set_number - b.set_number)
              .map((dbSet, i) => {
                // Pre-fill with last performance if values are NULL
                const lastSet = lastPerf?.[i];

                // Calculate placeholder values from last performance or targets
                const placeholderReps = isDuration
                  ? undefined
                  : lastSet?.reps?.toString() ||
                    wle.target_rep_min?.toString() ||
                    '8';
                const placeholderWeight = (lastSet?.weight_kg ?? 0).toString();
                const placeholderDuration = isDuration
                  ? wle.target_duration_seconds?.toString() || '30'
                  : undefined;

                // For sets that already have values in DB, use those values
                // For new sets (null values), leave empty and use placeholders
                const hasExistingReps = dbSet.reps !== null;
                const hasExistingWeight = dbSet.weight_kg !== null;
                const hasExistingDuration = dbSet.duration_seconds !== null;

                return {
                  id: dbSet.id,
                  set_number: dbSet.set_number,
                  reps: hasExistingReps
                    ? dbSet.reps!.toString()
                    : isDuration
                      ? ''
                      : '',
                  weight: hasExistingWeight ? dbSet.weight_kg!.toString() : '',
                  durationSeconds: hasExistingDuration
                    ? dbSet.duration_seconds!.toString()
                    : '',
                  completed: dbSet.completed_at !== null,
                  placeholderReps,
                  placeholderWeight,
                  placeholderDuration,
                };
              });

            return {
              workoutLogExercise: wle,
              exercise: masterExercise,
              exerciseType,
              sets,
              lastPerformance: lastPerf,
              isExpanded: true,
              notes: wle.notes || '',
            } as ExerciseWithSets;
          }),
        );

        setExercisesWithSets(
          exercisesDataRaw.filter((e): e is ExerciseWithSets => e !== null),
        );
      } else if (allSets.length > 0) {
        // Legacy: ad-hoc workout with logged sets but no workout_log_exercises
        const exerciseIds = [...new Set(allSets.map((s) => s.exercise_id))];

        const exercisesDataRaw = await Promise.all(
          exerciseIds.map(async (exerciseId) => {
            const exercise = allExercises.find((e) => e.id === exerciseId);
            if (!exercise) return null;

            const dbSets =
              setsByWorkoutLogExercise[`exercise-${exerciseId}`] || [];
            const lastPerf = await getLastPerformance(
              exerciseId,
              activeWorkout.id,
            );
            const exerciseType = exercise.exercise_type || 'reps_weight';

            const mockWorkoutLogExercise: WorkoutLogExerciseWithDetails = {
              id: -exerciseId,
              workout_log_id: activeWorkout.id,
              exercise_id: exerciseId,
              order_index: 0,
              superset_group_id: null,
              target_sets: dbSets.length || 3,
              target_rep_min: null,
              target_rep_max: null,
              target_duration_seconds: null,
              notes: null,
              created_at: '',
              exercise_name: exercise.name,
              exercise_description: exercise.description,
              muscle_groups: exercise.muscle_groups,
              equipment: exercise.equipment,
              exercise_type: exerciseType,
            };

            const sets: SetData[] = dbSets
              .sort((a, b) => a.set_number - b.set_number)
              .map((dbSet, i) => {
                const lastSet = lastPerf?.[i];
                const isDur =
                  exerciseType === 'duration' ||
                  exerciseType === 'duration_weight';

                return {
                  id: dbSet.id,
                  set_number: dbSet.set_number,
                  reps: dbSet.reps !== null ? dbSet.reps.toString() : '',
                  weight:
                    dbSet.weight_kg !== null ? dbSet.weight_kg.toString() : '',
                  durationSeconds:
                    dbSet.duration_seconds !== null
                      ? dbSet.duration_seconds.toString()
                      : '',
                  completed: dbSet.completed_at !== null,
                  placeholderReps: isDur
                    ? undefined
                    : lastSet?.reps?.toString() || '8',
                  placeholderWeight: (lastSet?.weight_kg ?? 0).toString(),
                  placeholderDuration: isDur ? '30' : undefined,
                };
              });

            return {
              workoutLogExercise: mockWorkoutLogExercise,
              exercise,
              exerciseType,
              sets,
              lastPerformance: lastPerf,
              isExpanded: true,
              notes: '',
            } as ExerciseWithSets;
          }),
        );

        setExercisesWithSets(
          exercisesDataRaw.filter((e): e is ExerciseWithSets => e !== null),
        );
      }
    };

    initExercises();
  }, [
    activeWorkout,
    allExercises,
    getLastPerformance,
    getWorkoutLogExercises,
    getWorkoutSets,
    isInitialized,
  ]);

  // Core save function - UPDATES existing set in DB (no create, sets are pre-created)
  const saveSetToDb = useCallback(
    async (setId: number, exerciseType: ExerciseType, setData: SetData) => {
      if (!activeWorkout) return;

      const isDuration =
        exerciseType === 'duration' || exerciseType === 'duration_weight';

      // Parse values
      const reps = isDuration ? null : parseReps(setData.reps);
      const weight = parseWeight(setData.weight);
      const duration = isDuration
        ? parseDuration(setData.durationSeconds)
        : null;

      const saveKey = `set-${setId}`;

      // Wait for any pending save for this set
      const pending = pendingSaves.current.get(saveKey);
      if (pending) {
        await pending;
      }

      const savePromise = (async () => {
        try {
          await updateSet(setId, {
            reps,
            weight_kg: weight,
            duration_seconds: duration,
          });
        } catch (err) {
          console.error('Failed to save set:', err);
        } finally {
          pendingSaves.current.delete(saveKey);
        }
      })();

      pendingSaves.current.set(saveKey, savePromise);
      return savePromise;
    },
    [activeWorkout, updateSet],
  );

  // Debounced save function for auto-save on field change
  const debouncedSaveRef = useRef<ReturnType<
    typeof debounce<typeof saveSetToDb>
  > | null>(null);

  useEffect(() => {
    debouncedSaveRef.current = debounce(saveSetToDb, 500);
  }, [saveSetToDb]);

  // Handle set field change with auto-save
  const handleSetChange = useCallback(
    (
      exerciseIndex: number,
      setIndex: number,
      field: 'reps' | 'weight' | 'durationSeconds',
      value: string,
    ) => {
      // Update local state immediately for responsive UI
      setExercisesWithSets((prev) => {
        const updated = [...prev];
        const exerciseData = updated[exerciseIndex];
        if (!exerciseData) return prev;

        const newSets = exerciseData.sets.map((set, i) =>
          i === setIndex ? { ...set, [field]: value } : set,
        );

        updated[exerciseIndex] = {
          ...exerciseData,
          sets: newSets,
        };

        // Trigger debounced save - sets are pre-created so we always have an ID
        const updatedSet = newSets[setIndex];
        if (debouncedSaveRef.current && updatedSet) {
          debouncedSaveRef.current(
            updatedSet.id,
            exerciseData.exerciseType,
            updatedSet,
          );
        }

        return updated;
      });
    },
    [],
  );

  // Mark a single set as completed (sets completed_at in DB)
  const handleCompleteSet = useCallback(
    async (exerciseIndex: number, setIndex: number): Promise<boolean> => {
      const loadingKey = `completeSet:${exerciseIndex}:${setIndex}`;
      const currentExercises = exercisesRef.current;
      const exerciseData = currentExercises[exerciseIndex];
      if (!exerciseData || !activeWorkout) return false;

      const setData = exerciseData.sets[setIndex];
      if (!setData || setData.completed) return false; // Already completed

      setLoading(loadingKey, true);
      try {
        // First, ensure we save any pending field values
        const isDuration =
          exerciseData.exerciseType === 'duration' ||
          exerciseData.exerciseType === 'duration_weight';

        const reps = isDuration ? null : parseReps(setData.reps);
        const weight = parseWeight(setData.weight);
        const duration = isDuration
          ? parseDuration(setData.durationSeconds)
          : null;

        // Update values first
        await updateSet(setData.id, {
          reps,
          weight_kg: weight,
          duration_seconds: duration,
        });

        // Then mark as completed
        await completeSet(setData.id);

        // Update local state
        setExercisesWithSets((prev) => {
          const updated = [...prev];
          if (updated[exerciseIndex]?.sets[setIndex]) {
            updated[exerciseIndex] = {
              ...updated[exerciseIndex],
              sets: updated[exerciseIndex].sets.map((s, i) =>
                i === setIndex ? { ...s, completed: true } : s,
              ),
            };
          }
          return updated;
        });
        return true;
      } catch (err) {
        console.error('Failed to complete set:', err);
        return false;
      } finally {
        setLoading(loadingKey, false);
      }
    },
    [activeWorkout, updateSet, completeSet, setLoading],
  );

  // Uncomplete a set (user wants to edit it again)
  const handleUncompleteSet = useCallback(
    async (exerciseIndex: number, setIndex: number): Promise<boolean> => {
      const currentExercises = exercisesRef.current;
      const exerciseData = currentExercises[exerciseIndex];
      if (!exerciseData || !activeWorkout) return false;

      const setData = exerciseData.sets[setIndex];
      if (!setData || !setData.completed) return false; // Not completed

      try {
        await uncompleteSet(setData.id);

        setExercisesWithSets((prev) => {
          const updated = [...prev];
          if (updated[exerciseIndex]?.sets[setIndex]) {
            updated[exerciseIndex] = {
              ...updated[exerciseIndex],
              sets: updated[exerciseIndex].sets.map((s, i) =>
                i === setIndex ? { ...s, completed: false } : s,
              ),
            };
          }
          return updated;
        });
        return true;
      } catch (err) {
        console.error('Failed to uncomplete set:', err);
        return false;
      }
    },
    [activeWorkout, uncompleteSet],
  );

  // Complete all sets in a superset round
  const handleCompleteRound = useCallback(
    async (
      exerciseIndices: number[],
      roundNumber: number,
    ): Promise<boolean> => {
      if (!activeWorkout) return false;

      // Use first exercise index as the key for superset round loading
      const loadingKey = `completeRound:${exerciseIndices[0]}:${roundNumber}`;
      const currentExercises = exercisesRef.current;

      setLoading(loadingKey, true);
      try {
        // Save and complete all sets in the round
        for (const exerciseIndex of exerciseIndices) {
          const exerciseData = currentExercises[exerciseIndex];
          if (!exerciseData) continue;

          const setData = exerciseData.sets[roundNumber];
          if (!setData || setData.completed) continue;

          const isDuration =
            exerciseData.exerciseType === 'duration' ||
            exerciseData.exerciseType === 'duration_weight';

          const reps = isDuration ? null : parseReps(setData.reps);
          const weight = parseWeight(setData.weight);
          const duration = isDuration
            ? parseDuration(setData.durationSeconds)
            : null;

          // Update values
          await updateSet(setData.id, {
            reps,
            weight_kg: weight,
            duration_seconds: duration,
          });

          // Mark completed
          await completeSet(setData.id);
        }

        // Update local state
        setExercisesWithSets((prev) => {
          const updated = [...prev];
          for (const exerciseIndex of exerciseIndices) {
            if (updated[exerciseIndex]?.sets[roundNumber]) {
              updated[exerciseIndex] = {
                ...updated[exerciseIndex],
                sets: updated[exerciseIndex].sets.map((s, i) =>
                  i === roundNumber ? { ...s, completed: true } : s,
                ),
              };
            }
          }
          return updated;
        });

        return true;
      } catch (err) {
        console.error('Failed to complete round:', err);
        return false;
      } finally {
        setLoading(loadingKey, false);
      }
    },
    [activeWorkout, updateSet, completeSet, setLoading],
  );

  // Add a new set to an exercise (inserts to DB and updates local state)
  const handleAddSet = useCallback(
    async (exerciseIndex: number) => {
      const loadingKey = `addSet:${exerciseIndex}`;
      const currentExercises = exercisesRef.current;
      const exerciseData = currentExercises[exerciseIndex];
      if (!exerciseData) return;
      if (exerciseData.workoutLogExercise.id <= 0) return; // Can't add to legacy exercise

      setLoading(loadingKey, true);
      try {
        const newSet = await addSetToExercise(
          exerciseData.workoutLogExercise.id,
        );

        const lastSet = exerciseData.sets[exerciseData.sets.length - 1];
        const isDuration =
          exerciseData.exerciseType === 'duration' ||
          exerciseData.exerciseType === 'duration_weight';

        // Add to local state - use empty values with placeholders from last set
        setExercisesWithSets((prev) => {
          const updated = [...prev];
          if (!updated[exerciseIndex]) return prev;

          updated[exerciseIndex] = {
            ...updated[exerciseIndex],
            sets: [
              ...updated[exerciseIndex].sets,
              {
                id: newSet.id,
                set_number: newSet.set_number,
                reps: '',
                weight: '',
                durationSeconds: '',
                completed: false,
                placeholderReps: isDuration
                  ? undefined
                  : lastSet?.placeholderReps || lastSet?.reps || '0',
                placeholderWeight:
                  lastSet?.placeholderWeight || lastSet?.weight || '0',
                placeholderDuration: isDuration
                  ? lastSet?.placeholderDuration ||
                    lastSet?.durationSeconds ||
                    '30'
                  : undefined,
              },
            ],
          };
          return updated;
        });
      } catch (err) {
        console.error('Failed to add set:', err);
      } finally {
        setLoading(loadingKey, false);
      }
    },
    [addSetToExercise, setLoading],
  );

  // Add set to all exercises in a superset (inserts to DB for each)
  const handleAddSetToSuperset = useCallback(
    async (exerciseIndices: number[]) => {
      const loadingKey = `addRound:${exerciseIndices[0]}`;
      const currentExercises = exercisesRef.current;
      if (!activeWorkout) return;

      // Get the superset group ID from the first exercise
      const firstExercise = currentExercises[exerciseIndices[0]];
      if (!firstExercise) return;

      const supersetGroupId =
        firstExercise.workoutLogExercise.superset_group_id;
      if (!supersetGroupId) return;

      setLoading(loadingKey, true);
      try {
        const newSets = await addRoundToSuperset(
          activeWorkout.id,
          supersetGroupId,
        );

        // Update local state for each exercise - use empty values with placeholders
        setExercisesWithSets((prev) => {
          const updated = [...prev];

          for (let i = 0; i < exerciseIndices.length; i++) {
            const exerciseIndex = exerciseIndices[i];
            const exerciseData = currentExercises[exerciseIndex];
            if (!exerciseData) continue;

            const newSet = newSets.find(
              (s) =>
                s.workout_log_exercise_id ===
                exerciseData.workoutLogExercise.id,
            );
            if (!newSet) continue;

            const lastSet = exerciseData.sets[exerciseData.sets.length - 1];
            const isDuration =
              exerciseData.exerciseType === 'duration' ||
              exerciseData.exerciseType === 'duration_weight';

            updated[exerciseIndex] = {
              ...updated[exerciseIndex],
              sets: [
                ...updated[exerciseIndex].sets,
                {
                  id: newSet.id,
                  set_number: newSet.set_number,
                  reps: '',
                  weight: '',
                  durationSeconds: '',
                  completed: false,
                  placeholderReps: isDuration
                    ? undefined
                    : lastSet?.placeholderReps || lastSet?.reps || '0',
                  placeholderWeight:
                    lastSet?.placeholderWeight || lastSet?.weight || '0',
                  placeholderDuration: isDuration
                    ? lastSet?.placeholderDuration ||
                      lastSet?.durationSeconds ||
                      '30'
                    : undefined,
                },
              ],
            };
          }

          return updated;
        });
      } catch (err) {
        console.error('Failed to add superset round:', err);
      } finally {
        setLoading(loadingKey, false);
      }
    },
    [activeWorkout, addRoundToSuperset, setLoading],
  );

  // Delete a set (removes from DB and local state)
  const handleDeleteSet = useCallback(
    async (exerciseIndex: number, _setIndex: number) => {
      const loadingKey = `deleteSet:${exerciseIndex}`;
      const currentExercises = exercisesRef.current;
      const exerciseData = currentExercises[exerciseIndex];
      if (!exerciseData) return;
      if (exerciseData.workoutLogExercise.id <= 0) return; // Can't remove from legacy

      // Don't allow removing if only 1 set left
      if (exerciseData.sets.length <= 1) return;

      setLoading(loadingKey, true);
      try {
        await removeSetFromExercise(exerciseData.workoutLogExercise.id);

        // Update local state - remove the last set
        setExercisesWithSets((prev) => {
          const updated = [...prev];
          if (!updated[exerciseIndex]) return prev;

          const newSets = updated[exerciseIndex].sets.slice(0, -1);
          updated[exerciseIndex] = {
            ...updated[exerciseIndex],
            sets: newSets,
          };
          return updated;
        });
      } catch (err) {
        console.error('Failed to delete set:', err);
      } finally {
        setLoading(loadingKey, false);
      }
    },
    [removeSetFromExercise, setLoading],
  );

  // Delete a round from all exercises in a superset
  // If only 1 round left, delete the entire superset (all exercises)
  const handleDeleteRound = useCallback(
    async (supersetExerciseIndices: number[], _roundNumber: number) => {
      const loadingKey = `deleteRound:${supersetExerciseIndices[0]}`;
      const currentExercises = exercisesRef.current;
      if (!activeWorkout) return;

      // Get the superset group ID
      const firstExercise = currentExercises[supersetExerciseIndices[0]];
      if (!firstExercise) return;

      const supersetGroupId =
        firstExercise.workoutLogExercise.superset_group_id;
      if (!supersetGroupId) return;

      setLoading(loadingKey, true);
      try {
        // If only 1 round left, delete all exercises in the superset
        if (firstExercise.sets.length <= 1) {
          // Delete all exercises in the superset from DB
          for (const exerciseIndex of supersetExerciseIndices) {
            const exerciseData = currentExercises[exerciseIndex];
            if (exerciseData && exerciseData.workoutLogExercise.id > 0) {
              await deleteWorkoutLogExercise(
                exerciseData.workoutLogExercise.id,
              );
            }
          }

          // Remove all superset exercises from local state
          setExercisesWithSets((prev) =>
            prev.filter((_, i) => !supersetExerciseIndices.includes(i)),
          );
          return;
        }

        await removeRoundFromSuperset(activeWorkout.id, supersetGroupId);

        // Update local state - remove the last set from each exercise
        setExercisesWithSets((prev) => {
          const updated = [...prev];

          supersetExerciseIndices.forEach((exerciseIndex) => {
            const exerciseData = updated[exerciseIndex];
            if (exerciseData && exerciseData.sets.length > 1) {
              updated[exerciseIndex] = {
                ...exerciseData,
                sets: exerciseData.sets.slice(0, -1),
              };
            }
          });

          return updated;
        });
      } catch (err) {
        console.error('Failed to delete round:', err);
      } finally {
        setLoading(loadingKey, false);
      }
    },
    [
      activeWorkout,
      removeRoundFromSuperset,
      deleteWorkoutLogExercise,
      setLoading,
    ],
  );

  // Remove an exercise entirely (from workout_log_exercises and all its sets)
  const handleRemoveExercise = useCallback(
    async (exerciseIndex: number) => {
      const currentExercises = exercisesRef.current;
      const exerciseData = currentExercises[exerciseIndex];

      if (exerciseData && exerciseData.workoutLogExercise.id > 0) {
        try {
          await deleteWorkoutLogExercise(exerciseData.workoutLogExercise.id);
        } catch (err) {
          console.error('Failed to delete workout log exercise:', err);
        }
      }

      // Remove from local state
      setExercisesWithSets((prev) =>
        prev.filter((_, i) => i !== exerciseIndex),
      );
    },
    [deleteWorkoutLogExercise],
  );

  // Link two or more existing exercises into a superset
  const handleLinkExercisesAsSuperset = useCallback(
    async (exerciseIndices: number[]) => {
      if (exerciseIndices.length < 2) return;

      const currentExercises = exercisesRef.current;
      const supersetGroupId = `ss-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      try {
        // Update all exercises with the new superset group ID
        for (const exerciseIndex of exerciseIndices) {
          const exerciseData = currentExercises[exerciseIndex];
          if (exerciseData && exerciseData.workoutLogExercise.id > 0) {
            await updateWorkoutLogExercise(exerciseData.workoutLogExercise.id, {
              supersetGroupId,
            });
          }
        }

        // Update local state
        setExercisesWithSets((prev) =>
          prev.map((ex, idx) =>
            exerciseIndices.includes(idx)
              ? {
                  ...ex,
                  workoutLogExercise: {
                    ...ex.workoutLogExercise,
                    superset_group_id: supersetGroupId,
                  },
                }
              : ex,
          ),
        );
      } catch (err) {
        console.error('Failed to link exercises as superset:', err);
      }
    },
    [updateWorkoutLogExercise],
  );

  // Break a superset (remove superset_group_id from exercises)
  const handleBreakSuperset = useCallback(
    async (supersetGroupId: string) => {
      const currentExercises = exercisesRef.current;
      const affectedExercises = currentExercises.filter(
        (ex) => ex.workoutLogExercise.superset_group_id === supersetGroupId,
      );

      try {
        // Update all affected exercises in DB
        for (const exerciseData of affectedExercises) {
          if (exerciseData.workoutLogExercise.id > 0) {
            await updateWorkoutLogExercise(exerciseData.workoutLogExercise.id, {
              supersetGroupId: null,
            });
          }
        }

        // Update local state
        setExercisesWithSets((prev) =>
          prev.map((ex) =>
            ex.workoutLogExercise.superset_group_id === supersetGroupId
              ? {
                  ...ex,
                  workoutLogExercise: {
                    ...ex.workoutLogExercise,
                    superset_group_id: null,
                  },
                }
              : ex,
          ),
        );
      } catch (err) {
        console.error('Failed to break superset:', err);
      }
    },
    [updateWorkoutLogExercise],
  );

  // Add a new exercise to the workout (with pre-created sets)
  const handleAddExercise = useCallback(
    async (exercise: Exercise, supersetGroupId?: string) => {
      if (!activeWorkout) return;

      const lastPerf = await getLastPerformance(exercise.id, activeWorkout.id);
      const exerciseType = exercise.exercise_type || 'reps_weight';
      const isDuration =
        exerciseType === 'duration' || exerciseType === 'duration_weight';

      // Get current max order_index
      const currentExercises = exercisesRef.current;
      const maxOrderIndex = Math.max(
        0,
        ...currentExercises.map((e) => e.workoutLogExercise.order_index),
      );

      try {
        // Add to workout_log_exercises in DB (this also pre-creates sets now)
        const newWorkoutLogExercise = await addWorkoutLogExercise(
          activeWorkout.id,
          exercise.id,
          {
            orderIndex: maxOrderIndex + 1,
            supersetGroupId: supersetGroupId || null,
            targetSets: 3,
            targetRepMin: isDuration ? null : 8,
            targetRepMax: isDuration ? null : 12,
            targetDurationSeconds: isDuration ? 30 : null,
          },
        );

        // Get the pre-created sets for this exercise
        const allSets = await getWorkoutSets(activeWorkout.id);
        const exerciseSets = allSets
          .filter((s) => s.workout_log_exercise_id === newWorkoutLogExercise.id)
          .sort((a, b) => a.set_number - b.set_number);

        // Create the full details object
        const workoutLogExerciseWithDetails: WorkoutLogExerciseWithDetails = {
          ...newWorkoutLogExercise,
          exercise_name: exercise.name,
          exercise_description: exercise.description,
          muscle_groups: exercise.muscle_groups,
          equipment: exercise.equipment,
          exercise_type: exerciseType,
        };

        // Convert to SetData format - use empty values with placeholders
        const sets: SetData[] = exerciseSets.map((dbSet, i) => {
          const lastSet = lastPerf?.[i];
          return {
            id: dbSet.id,
            set_number: dbSet.set_number,
            reps: '',
            weight: '',
            durationSeconds: '',
            completed: false,
            placeholderReps: isDuration
              ? undefined
              : lastSet?.reps?.toString() || '10',
            placeholderWeight: (lastSet?.weight_kg ?? 0).toString(),
            placeholderDuration: isDuration ? '30' : undefined,
          };
        });

        // Add to local state
        setExercisesWithSets((prev) => [
          ...prev,
          {
            workoutLogExercise: workoutLogExerciseWithDetails,
            exercise,
            exerciseType,
            sets,
            lastPerformance: lastPerf,
            isExpanded: true,
            notes: '',
          },
        ]);
      } catch (err) {
        console.error('Failed to add exercise:', err);
      }
    },
    [activeWorkout, getLastPerformance, addWorkoutLogExercise, getWorkoutSets],
  );

  // Toggle exercise expansion
  const toggleExerciseExpand = useCallback((index: number) => {
    setExercisesWithSets((prev) =>
      prev.map((ex, i) =>
        i === index ? { ...ex, isExpanded: !ex.isExpanded } : ex,
      ),
    );
  }, []);

  // Update exercise notes
  const updateExerciseNotes = useCallback(
    (exerciseIndex: number, notes: string) => {
      setExercisesWithSets((prev) => {
        const updated = [...prev];
        if (updated[exerciseIndex]) {
          updated[exerciseIndex] = {
            ...updated[exerciseIndex],
            notes,
          };
        }
        return updated;
      });
    },
    [],
  );

  // Save duration set (called when duration timer completes)
  const saveDurationSet = useCallback(
    async (exerciseIndex: number, setIndex: number, actualSeconds: number) => {
      if (!activeWorkout) return;

      const currentExercises = exercisesRef.current;
      const exerciseData = currentExercises[exerciseIndex];
      if (!exerciseData) return;

      const setData = exerciseData.sets[setIndex];
      const weight = parseWeight(setData?.weight);

      try {
        // Update the set with actual duration and mark as completed
        await updateSet(setData.id, {
          duration_seconds: actualSeconds,
          weight_kg: weight,
        });
        await completeSet(setData.id);

        setExercisesWithSets((prev) => {
          const updated = [...prev];
          if (!updated[exerciseIndex]) return prev;
          updated[exerciseIndex] = {
            ...updated[exerciseIndex],
            sets: updated[exerciseIndex].sets.map((s, i) =>
              i === setIndex
                ? {
                    ...s,
                    durationSeconds: actualSeconds.toString(),
                    completed: true,
                  }
                : s,
            ),
          };
          return updated;
        });
      } catch (err) {
        console.error('Failed to save duration set:', err);
      }
    },
    [activeWorkout, updateSet, completeSet],
  );

  // End the workout
  const handleEndWorkout = useCallback(
    async (notes?: string) => {
      if (!activeWorkout) return;
      await endWorkout(activeWorkout.id, notes);
    },
    [activeWorkout, endWorkout],
  );

  // Cancel the workout
  const handleCancelWorkout = useCallback(async () => {
    if (!activeWorkout) return;
    await cancelWorkout(activeWorkout.id);
  }, [activeWorkout, cancelWorkout]);

  // Group exercises by superset
  const groupedExercises = (() => {
    const result: (ExerciseWithSets | ExerciseWithSets[])[] = [];
    const processedIndices = new Set<number>();

    exercisesWithSets.forEach((ex, idx) => {
      if (processedIndices.has(idx)) return;

      const supersetGroupId = ex.workoutLogExercise.superset_group_id;
      if (supersetGroupId) {
        const supersetExercises = exercisesWithSets.filter(
          (e) => e.workoutLogExercise.superset_group_id === supersetGroupId,
        );

        if (supersetExercises.length > 1) {
          supersetExercises.forEach((e) => {
            const originalIdx = exercisesWithSets.indexOf(e);
            processedIndices.add(originalIdx);
          });
          result.push(supersetExercises);
        } else {
          result.push(ex);
          processedIndices.add(idx);
        }
      } else {
        result.push(ex);
        processedIndices.add(idx);
      }
    });

    return result;
  })();

  // Calculate total completed sets
  const totalCompletedSets = exercisesWithSets.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => s.completed).length,
    0,
  );

  // Helper to get exercise ID (for compatibility with components)
  const getExerciseId = useCallback(
    (exerciseOrData: ExerciseWithSets | Exercise): number => {
      if ('workoutLogExercise' in exerciseOrData) {
        return exerciseOrData.exercise.id;
      }
      return exerciseOrData.id;
    },
    [],
  );

  return {
    // State
    activeWorkout,
    exercisesWithSets,
    groupedExercises,
    allExercises,
    totalCompletedSets,
    isInitialized,

    // Loading state utilities
    isLoading,

    // Actions
    handleSetChange,
    handleCompleteSet,
    handleUncompleteSet,
    handleCompleteRound,
    handleAddSet,
    handleAddSetToSuperset,
    handleDeleteSet,
    handleDeleteRound,
    handleRemoveExercise,
    handleAddExercise,
    handleLinkExercisesAsSuperset,
    handleBreakSuperset,
    toggleExerciseExpand,
    updateExerciseNotes,
    saveDurationSet,
    handleEndWorkout,
    handleCancelWorkout,

    // Utilities
    getExerciseId,
  };
}
