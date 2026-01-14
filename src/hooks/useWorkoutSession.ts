import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Exercise,
  ExerciseType,
  ProgramExerciseWithDetails,
  WorkoutSet,
} from '../types';
import { useExercises } from './useExercises';
import { useWorkoutLogs } from './useWorkoutLogs';
import { useWorkoutPrograms } from './useWorkoutPrograms';

// Simplified set data - if it has an id, it's saved
export interface SetData {
  id?: number; // Database ID - if present, set is persisted
  tempId: string; // Client-side identifier
  reps: string;
  weight: string;
  durationSeconds: string;
}

export interface ExerciseWithSets {
  exercise: Exercise | ProgramExerciseWithDetails;
  exerciseType: ExerciseType;
  sets: SetData[];
  lastPerformance: WorkoutSet[] | null;
  isExpanded: boolean;
  supersetGroupId?: string | null;
  notes: string;
}

// Debounce helper
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

export function useWorkoutSession() {
  const {
    activeWorkout,
    activeWorkoutSets,
    resumeWorkout,
    endWorkout,
    cancelWorkout,
    addSet,
    updateSet,
    deleteSet,
    getLastPerformance,
  } = useWorkoutLogs();

  const { activeProgram, fetchActiveProgram } = useWorkoutPrograms();
  const { exercises: allExercises, fetchExercises } = useExercises();

  const [exercisesWithSets, setExercisesWithSets] = useState<
    ExerciseWithSets[]
  >([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Track pending saves to prevent race conditions
  const pendingSaves = useRef<Map<string, Promise<void>>>(new Map());

  // Helper to get exercise ID from exercise data
  const getExerciseId = useCallback(
    (exercise: Exercise | ProgramExerciseWithDetails): number => {
      return 'exercise_id' in exercise ? exercise.exercise_id : exercise.id;
    },
    [],
  );

  // Initialize session on mount
  useEffect(() => {
    const init = async () => {
      await resumeWorkout();
      await fetchActiveProgram();
      await fetchExercises();
      setIsInitialized(true);
    };
    init();
  }, [resumeWorkout, fetchActiveProgram, fetchExercises]);

  // Initialize exercises from program session and merge with logged sets
  useEffect(() => {
    const initExercises = async () => {
      if (!activeWorkout || !isInitialized) return;

      // Group logged sets by exercise for easy lookup
      const setsByExercise = activeWorkoutSets.reduce(
        (acc, set) => {
          if (!acc[set.exercise_id]) {
            acc[set.exercise_id] = [];
          }
          acc[set.exercise_id].push(set);
          return acc;
        },
        {} as Record<number, typeof activeWorkoutSets>,
      );

      // If workout has a session, load those exercises
      if (activeWorkout.session_id && activeProgram) {
        const session = activeProgram.sessions.find(
          (s) => s.id === activeWorkout.session_id,
        );
        if (session) {
          const exercisesData: ExerciseWithSets[] = await Promise.all(
            session.exercises.map(async (ex) => {
              const lastPerf = await getLastPerformance(ex.exercise_id);
              const exerciseType = ex.exercise_type || 'reps_weight';
              const isDuration =
                exerciseType === 'duration' ||
                exerciseType === 'duration_weight';

              // Check if we have logged sets for this exercise
              const loggedSets = setsByExercise[ex.exercise_id] || [];

              // Determine how many sets to show (at least target_sets, but more if logged)
              const numSets = Math.max(ex.target_sets, loggedSets.length);

              // Create sets, merging logged data where available
              const sets = Array.from({ length: numSets }, (_, i) => {
                const loggedSet = loggedSets[i];
                const lastSet = lastPerf?.[i];

                if (loggedSet) {
                  // This set was already logged - use DB values
                  return {
                    id: loggedSet.id,
                    tempId: `logged-${loggedSet.id}-${i}`,
                    reps: loggedSet.reps?.toString() || '',
                    weight: loggedSet.weight_kg?.toString() || '',
                    durationSeconds:
                      loggedSet.duration_seconds?.toString() || '',
                  };
                }

                // Empty set - prefill from last performance or defaults
                return {
                  tempId: `${ex.id}-${i}-${Date.now()}-${Math.random()}`,
                  reps: isDuration
                    ? ''
                    : lastSet?.reps?.toString() ||
                      (ex.target_rep_min?.toString() ?? '8'),
                  weight: lastSet?.weight_kg?.toString() || '0',
                  durationSeconds: isDuration
                    ? ex.target_duration_seconds?.toString() || '30'
                    : '',
                };
              });

              return {
                exercise: ex,
                exerciseType,
                sets,
                lastPerformance: lastPerf,
                isExpanded: true,
                supersetGroupId: ex.superset_group_id,
                notes: '',
              };
            }),
          );
          setExercisesWithSets(exercisesData);
        }
      } else if (activeWorkoutSets.length > 0) {
        // Ad-hoc workout with logged sets but no program session
        const exerciseIds = [
          ...new Set(activeWorkoutSets.map((s) => s.exercise_id)),
        ];
        const exercisesDataRaw = await Promise.all(
          exerciseIds.map(async (exerciseId) => {
            const exercise = allExercises.find((e) => e.id === exerciseId);
            if (!exercise) return null;

            const loggedSets = setsByExercise[exerciseId] || [];
            const lastPerf = await getLastPerformance(exerciseId);
            const exerciseType = exercise.exercise_type || 'reps_weight';

            const sets = loggedSets.map((loggedSet, i) => ({
              id: loggedSet.id,
              tempId: `logged-${loggedSet.id}-${i}`,
              reps: loggedSet.reps?.toString() || '',
              weight: loggedSet.weight_kg?.toString() || '',
              durationSeconds: loggedSet.duration_seconds?.toString() || '',
            }));

            return {
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
    activeProgram,
    activeWorkoutSets,
    allExercises,
    getLastPerformance,
    isInitialized,
  ]);

  // Core auto-save function - creates or updates set in DB
  const saveSetToDb = useCallback(
    async (
      exerciseIndex: number,
      setIndex: number,
      setData: SetData,
      exerciseData: ExerciseWithSets,
    ) => {
      if (!activeWorkout) return;

      const exerciseId = getExerciseId(exerciseData.exercise);
      const isDuration =
        exerciseData.exerciseType === 'duration' ||
        exerciseData.exerciseType === 'duration_weight';
      const hasWeight =
        exerciseData.exerciseType === 'reps_weight' ||
        exerciseData.exerciseType === 'duration_weight';

      // Parse values
      const reps = isDuration ? null : parseInt(setData.reps, 10) || null;
      const weight = hasWeight ? parseFloat(setData.weight) || null : null;
      const duration = isDuration
        ? parseInt(setData.durationSeconds, 10) || null
        : null;

      // Skip save if no meaningful data
      if (reps === null && duration === null && weight === null) return;

      const saveKey = `${exerciseIndex}-${setIndex}`;

      // Wait for any pending save for this set
      const pending = pendingSaves.current.get(saveKey);
      if (pending) {
        await pending;
      }

      const savePromise = (async () => {
        try {
          if (setData.id) {
            // Update existing set
            await updateSet(setData.id, {
              reps,
              weight_kg: weight,
              duration_seconds: duration,
            });
          } else {
            // Create new set
            const newSet = await addSet(
              activeWorkout.id,
              exerciseId,
              reps,
              weight,
              duration,
              exerciseData.notes || undefined,
            );

            // Update local state with the new ID
            setExercisesWithSets((prev) => {
              const updated = [...prev];
              if (updated[exerciseIndex]?.sets[setIndex]) {
                updated[exerciseIndex] = {
                  ...updated[exerciseIndex],
                  sets: updated[exerciseIndex].sets.map((s, i) =>
                    i === setIndex ? { ...s, id: newSet.id } : s,
                  ),
                };
              }
              return updated;
            });
          }
        } catch (err) {
          console.error('Failed to save set:', err);
        } finally {
          pendingSaves.current.delete(saveKey);
        }
      })();

      pendingSaves.current.set(saveKey, savePromise);
      return savePromise;
    },
    [activeWorkout, addSet, updateSet, getExerciseId],
  );

  // Debounced save function
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

        // Trigger debounced save with updated data
        const updatedSet = newSets[setIndex];
        if (debouncedSaveRef.current && updatedSet) {
          debouncedSaveRef.current(
            exerciseIndex,
            setIndex,
            updatedSet,
            updated[exerciseIndex],
          );
        }

        return updated;
      });
    },
    [],
  );

  // Add a new set to an exercise
  const handleAddSet = useCallback(
    async (exerciseIndex: number) => {
      if (!activeWorkout) return;

      const exerciseData = exercisesWithSets[exerciseIndex];
      if (!exerciseData) return;

      const lastSet = exerciseData.sets[exerciseData.sets.length - 1];
      const isDuration =
        exerciseData.exerciseType === 'duration' ||
        exerciseData.exerciseType === 'duration_weight';
      const hasWeight =
        exerciseData.exerciseType === 'reps_weight' ||
        exerciseData.exerciseType === 'duration_weight';

      const exerciseId = getExerciseId(exerciseData.exercise);

      // Default values from last set
      const reps = isDuration
        ? null
        : parseInt(lastSet?.reps || '0', 10) || null;
      const weight = hasWeight
        ? parseFloat(lastSet?.weight || '0') || null
        : null;
      const duration = isDuration
        ? parseInt(lastSet?.durationSeconds || '30', 10)
        : null;

      try {
        // Create new set in DB immediately
        const newSet = await addSet(
          activeWorkout.id,
          exerciseId,
          reps,
          weight,
          duration,
          exerciseData.notes || undefined,
        );

        // Add to local state with DB ID
        setExercisesWithSets((prev) => {
          const updated = [...prev];
          updated[exerciseIndex] = {
            ...updated[exerciseIndex],
            sets: [
              ...updated[exerciseIndex].sets,
              {
                id: newSet.id,
                tempId: `new-${newSet.id}-${Date.now()}`,
                reps: isDuration ? '' : lastSet?.reps || '0',
                weight: lastSet?.weight || '0',
                durationSeconds: isDuration
                  ? lastSet?.durationSeconds || '30'
                  : '',
              },
            ],
          };
          return updated;
        });
      } catch (err) {
        console.error('Failed to add set:', err);
      }
    },
    [activeWorkout, exercisesWithSets, addSet, getExerciseId],
  );

  // Add set to all exercises in a superset
  const handleAddSetToSuperset = useCallback(
    async (exerciseIndices: number[]) => {
      if (!activeWorkout) return;

      try {
        // Create sets for all exercises in parallel
        const results = await Promise.all(
          exerciseIndices.map(async (exerciseIndex) => {
            const exerciseData = exercisesWithSets[exerciseIndex];
            if (!exerciseData) return null;

            const lastSet = exerciseData.sets[exerciseData.sets.length - 1];
            const isDuration =
              exerciseData.exerciseType === 'duration' ||
              exerciseData.exerciseType === 'duration_weight';
            const hasWeight =
              exerciseData.exerciseType === 'reps_weight' ||
              exerciseData.exerciseType === 'duration_weight';

            const exerciseId = getExerciseId(exerciseData.exercise);
            const reps = isDuration
              ? null
              : parseInt(lastSet?.reps || '0', 10) || null;
            const weight = hasWeight
              ? parseFloat(lastSet?.weight || '0') || null
              : null;
            const duration = isDuration
              ? parseInt(lastSet?.durationSeconds || '30', 10)
              : null;

            const newSet = await addSet(
              activeWorkout.id,
              exerciseId,
              reps,
              weight,
              duration,
            );

            return {
              exerciseIndex,
              newSet,
              isDuration,
              lastSet,
            };
          }),
        );

        // Update local state
        setExercisesWithSets((prev) => {
          const updated = [...prev];
          for (const result of results) {
            if (!result) continue;
            const { exerciseIndex, newSet, isDuration, lastSet } = result;

            updated[exerciseIndex] = {
              ...updated[exerciseIndex],
              sets: [
                ...updated[exerciseIndex].sets,
                {
                  id: newSet.id,
                  tempId: `new-${newSet.id}-${Date.now()}`,
                  reps: isDuration ? '' : lastSet?.reps || '0',
                  weight: lastSet?.weight || '0',
                  durationSeconds: isDuration
                    ? lastSet?.durationSeconds || '30'
                    : '',
                },
              ],
            };
          }
          return updated;
        });
      } catch (err) {
        console.error('Failed to add superset round:', err);
      }
    },
    [activeWorkout, exercisesWithSets, addSet, getExerciseId],
  );

  // Delete a set
  const handleDeleteSet = useCallback(
    async (exerciseIndex: number, setIndex: number) => {
      const setData = exercisesWithSets[exerciseIndex]?.sets[setIndex];
      if (!setData) return;

      // Delete from DB if it exists
      if (setData.id) {
        await deleteSet(setData.id);
      }

      // Update local state
      setExercisesWithSets((prev) => {
        const updated = [...prev];
        const newSets = updated[exerciseIndex].sets.filter(
          (_, i) => i !== setIndex,
        );

        // If no sets left, remove the exercise entirely
        if (newSets.length === 0) {
          return updated.filter((_, i) => i !== exerciseIndex);
        }

        updated[exerciseIndex] = {
          ...updated[exerciseIndex],
          sets: newSets,
        };
        return updated;
      });
    },
    [exercisesWithSets, deleteSet],
  );

  // Delete a round from all exercises in a superset
  const handleDeleteRound = useCallback(
    async (supersetExerciseIndices: number[], roundNumber: number) => {
      // Collect all set IDs to delete
      const setIdsToDelete: number[] = [];
      for (const exerciseIndex of supersetExerciseIndices) {
        const set = exercisesWithSets[exerciseIndex]?.sets[roundNumber];
        if (set?.id) {
          setIdsToDelete.push(set.id);
        }
      }

      // Delete from DB in parallel
      if (setIdsToDelete.length > 0) {
        await Promise.all(setIdsToDelete.map((id) => deleteSet(id)));
      }

      // Update local state
      setExercisesWithSets((prev) => {
        const updated = [...prev];

        supersetExerciseIndices.forEach((exerciseIndex) => {
          const exerciseData = updated[exerciseIndex];
          if (exerciseData?.sets[roundNumber]) {
            updated[exerciseIndex] = {
              ...exerciseData,
              sets: [
                ...exerciseData.sets.slice(0, roundNumber),
                ...exerciseData.sets.slice(roundNumber + 1),
              ],
            };
          }
        });

        // Remove exercises with no sets left
        const indicesToRemove = supersetExerciseIndices
          .filter((idx) => updated[idx]?.sets.length === 0)
          .sort((a, b) => b - a);

        indicesToRemove.forEach((idx) => {
          updated.splice(idx, 1);
        });

        return updated;
      });
    },
    [exercisesWithSets, deleteSet],
  );

  // Remove an exercise entirely
  const handleRemoveExercise = useCallback(
    async (exerciseIndex: number) => {
      const exerciseData = exercisesWithSets[exerciseIndex];
      if (!exerciseData) return;

      // Delete all sets from DB
      const setIdsToDelete = exerciseData.sets
        .filter((set) => set.id)
        .map((set) => set.id as number);

      if (setIdsToDelete.length > 0) {
        await Promise.all(setIdsToDelete.map((id) => deleteSet(id)));
      }

      // Remove from local state
      setExercisesWithSets((prev) =>
        prev.filter((_, i) => i !== exerciseIndex),
      );
    },
    [exercisesWithSets, deleteSet],
  );

  // Add a new exercise to the workout
  const handleAddExercise = useCallback(
    async (exercise: Exercise) => {
      if (!activeWorkout) return;

      const lastPerf = await getLastPerformance(exercise.id);
      const exerciseType = exercise.exercise_type || 'reps_weight';
      const isDuration =
        exerciseType === 'duration' || exerciseType === 'duration_weight';
      const hasWeight =
        exerciseType === 'reps_weight' || exerciseType === 'duration_weight';

      // Create first set in DB immediately
      const reps = isDuration
        ? null
        : parseInt(lastPerf?.[0]?.reps?.toString() || '10', 10);
      const weight = hasWeight ? lastPerf?.[0]?.weight_kg || 0 : null;
      const duration = isDuration ? 30 : null;

      try {
        const newSet = await addSet(
          activeWorkout.id,
          exercise.id,
          reps,
          weight,
          duration,
        );

        setExercisesWithSets((prev) => [
          ...prev,
          {
            exercise,
            exerciseType,
            sets: [
              {
                id: newSet.id,
                tempId: `new-${newSet.id}-${Date.now()}`,
                reps: isDuration ? '' : lastPerf?.[0]?.reps?.toString() || '10',
                weight: lastPerf?.[0]?.weight_kg?.toString() || '0',
                durationSeconds: isDuration ? '30' : '',
              },
            ],
            lastPerformance: lastPerf,
            isExpanded: true,
            notes: '',
          },
        ]);
      } catch (err) {
        console.error('Failed to add exercise:', err);
      }
    },
    [activeWorkout, addSet, getLastPerformance],
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

      const exerciseData = exercisesWithSets[exerciseIndex];
      if (!exerciseData) return;

      const setData = exerciseData.sets[setIndex];
      const exerciseId = getExerciseId(exerciseData.exercise);
      const weight =
        exerciseData.exerciseType === 'duration_weight'
          ? parseFloat(setData.weight) || null
          : null;

      try {
        if (setData.id) {
          // Update existing set with actual duration
          await updateSet(setData.id, {
            duration_seconds: actualSeconds,
            weight_kg: weight,
          });

          setExercisesWithSets((prev) => {
            const updated = [...prev];
            updated[exerciseIndex] = {
              ...updated[exerciseIndex],
              sets: updated[exerciseIndex].sets.map((s, i) =>
                i === setIndex
                  ? { ...s, durationSeconds: actualSeconds.toString() }
                  : s,
              ),
            };
            return updated;
          });
        } else {
          // Create new set
          const newSet = await addSet(
            activeWorkout.id,
            exerciseId,
            null,
            weight,
            actualSeconds,
            exerciseData.notes || undefined,
          );

          setExercisesWithSets((prev) => {
            const updated = [...prev];
            updated[exerciseIndex] = {
              ...updated[exerciseIndex],
              sets: updated[exerciseIndex].sets.map((s, i) =>
                i === setIndex
                  ? {
                      ...s,
                      id: newSet.id,
                      durationSeconds: actualSeconds.toString(),
                    }
                  : s,
              ),
            };
            return updated;
          });
        }
      } catch (err) {
        console.error('Failed to save duration set:', err);
      }
    },
    [activeWorkout, exercisesWithSets, addSet, updateSet, getExerciseId],
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

      if (ex.supersetGroupId) {
        const supersetExercises = exercisesWithSets.filter(
          (e) => e.supersetGroupId === ex.supersetGroupId,
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

  // Calculate total completed sets (sets with DB id)
  const totalCompletedSets = exercisesWithSets.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => s.id).length,
    0,
  );

  return {
    // State
    activeWorkout,
    exercisesWithSets,
    groupedExercises,
    allExercises,
    totalCompletedSets,
    isInitialized,

    // Actions
    handleSetChange,
    handleAddSet,
    handleAddSetToSuperset,
    handleDeleteSet,
    handleDeleteRound,
    handleRemoveExercise,
    handleAddExercise,
    toggleExerciseExpand,
    updateExerciseNotes,
    saveDurationSet,
    handleEndWorkout,
    handleCancelWorkout,

    // Utilities
    getExerciseId,
  };
}
