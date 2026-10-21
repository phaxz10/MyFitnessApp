import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDB } from '../services/db';
import { sessions as exerciseSessions } from '../services/queries/exerciseHistory';
import type {
  Exercise,
  ExerciseType,
  WorkoutLogExerciseWithDetails,
  WorkoutSet,
} from '../types';
import { keyedDebounce } from '../utils/debounce';
import { resolveSetValues } from '../utils/setValues';
import { toDisplayWeight, type WeightUnit } from '../utils/units';
import { useExercises } from './useExercises';
import { useWeightUnit } from './useWeightUnit';
import { useWorkoutLogs } from './useWorkoutLogs';
import {
  appendSet,
  type ExerciseWithSets,
  patchExercise,
  patchSet,
  removeExercises,
  removeSets,
  type SetData,
  setSupersetGroup,
} from './workoutSessionState';

export type { ExerciseWithSets, SetData } from './workoutSessionState';

const SAVE_DEBOUNCE_MS = 500;

// A stored kg value as the string shown in a set cell
function weightText(kg: number, unit: WeightUnit): string {
  return toDisplayWeight(kg, unit, 'lift').toString();
}

// Last session's weight as a placeholder; none when it logged no weight, so
// tapping Done stores NULL rather than an invented 0.
function placeholderWeightText(
  lastSet: WorkoutSet | undefined,
  unit: WeightUnit,
): string | undefined {
  return lastSet?.weight_kg != null
    ? weightText(lastSet.weight_kg, unit)
    : undefined;
}

// Placeholders for a set appended after `lastSet`: what it shows, real values
// first.
function placeholdersAfter(
  lastSet: SetData | undefined,
  isDuration: boolean,
): Pick<
  SetData,
  'placeholderReps' | 'placeholderWeight' | 'placeholderDuration'
> {
  return {
    placeholderReps: isDuration
      ? undefined
      : lastSet?.reps || lastSet?.placeholderReps,
    placeholderWeight: lastSet?.weight || lastSet?.placeholderWeight,
    placeholderDuration: isDuration
      ? lastSet?.durationSeconds || lastSet?.placeholderDuration || '30'
      : undefined,
  };
}

function emptySet(dbSet: WorkoutSet): SetData {
  return {
    id: dbSet.id,
    set_number: dbSet.set_number,
    reps: '',
    weight: '',
    durationSeconds: '',
    completed: false,
  };
}

const isDurationType = (type: ExerciseType) =>
  type === 'duration' || type === 'duration_weight';

// Manages the full lifecycle of an active workout session.
//
// STATE MACHINE:
//   Mounting -> Loading -> (InitFromTemplate | InitFromLegacy | Empty) -> Active -> (Completed | Cancelled)
//
// KEY PATTERNS:
//   - exercisesRef: a ref mirror of exercisesWithSets state, kept current
//     eagerly, so handlers read the latest snapshot without stale closures.
//   - Handlers take (exerciseIndex, setIndex) from the UI but resolve them to
//     a Workout Log Exercise id / Set id BEFORE awaiting; every state update
//     after an await is keyed by id (workoutSessionState.ts), never by index.
//   - hasInitializedExercises: one-time gate. After the first DB load, local React state
//     becomes the source of truth — we never re-read from DB mid-session.
//   - Field edits auto-save through a keyed debouncer: one timer per Set id,
//     so editing set 1 then set 2 saves both. Pending saves flush on
//     pagehide, tab hidden, unmount and before finishing the workout.
//   - Sets are PRE-CREATED in the DB (via generate_series) when a workout starts.
//     All set operations are UPDATEs, never INSERTs. This simplifies the save logic:
//     every set already has a DB ID.
//   - Tapping Done fills empty fields from their placeholders (resolveSetValues).
//
// SUPERSET MODEL:
//   Exercises sharing a superset_group_id are rendered together. "Rounds" map to set
//   indices: round 0 = each exercise's set[0], round 1 = set[1], etc.
export function useWorkoutSession(dateOverride?: string) {
  const {
    activeWorkout,
    resumeWorkout,
    endWorkout,
    cancelWorkout,
    updateSet,
    completeSet,
    uncompleteSet,
    deleteSets,
    addSetToExercise,
    addRoundToSuperset,
    getWorkoutSets,
    getWorkoutLogExercises,
    addWorkoutLogExercise,
    deleteWorkoutLogExercises,
    updateWorkoutLogExercise,
  } = useWorkoutLogs();

  // Lookups include archived exercises (a workout can hold one that was
  // removed from the library since); pickers get live ones only.
  const {
    exercises: libraryExercises,
    exercisesIncludingArchived,
    fetchExercises,
  } = useExercises();

  // SetData.weight strings are in the display unit; convert at the DB edge.
  // A ref so callbacks read the current unit without re-creating.
  const weightUnit = useWeightUnit();
  const unitRef = useRef(weightUnit);
  unitRef.current = weightUnit;

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

  // Apply a pure, id-keyed update to state and to the ref at once, so a
  // second event in the same tick already sees the first.
  const commit = useCallback(
    (update: (state: ExerciseWithSets[]) => ExerciseWithSets[]) => {
      exercisesRef.current = update(exercisesRef.current);
      setExercisesWithSets(update);
    },
    [],
  );

  // Track whether exercises have been initialized from DB (only do this once!)
  const hasInitializedExercises = useRef(false);

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
      if (!exercisesIncludingArchived.length) return; // Wait for exercises to load

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
            const masterExercise = exercisesIncludingArchived.find(
              (e) => e.id === wle.exercise_id,
            );
            if (!masterExercise) {
              return null;
            }

            const db = await getDB();
            const lastPerfSessions = await exerciseSessions(
              db,
              wle.exercise_id,
              {
                completedSetsOnly: true,
                limit: 1,
                excludeWorkoutLogId: activeWorkout.id,
              },
            );
            const lastPerf = lastPerfSessions[0]?.sets ?? null;
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
                const placeholderWeight = placeholderWeightText(
                  lastSet,
                  unitRef.current,
                );
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
                  weight: hasExistingWeight
                    ? weightText(dbSet.weight_kg!, unitRef.current)
                    : '',
                  weightKg: dbSet.weight_kg,
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
            const exercise = exercisesIncludingArchived.find(
              (e) => e.id === exerciseId,
            );
            if (!exercise) return null;

            const dbSets =
              setsByWorkoutLogExercise[`exercise-${exerciseId}`] || [];
            const db = await getDB();
            const lastPerfSessions = await exerciseSessions(db, exerciseId, {
              completedSetsOnly: true,
              limit: 1,
              excludeWorkoutLogId: activeWorkout.id,
            });
            const lastPerf = lastPerfSessions[0]?.sets ?? null;
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
                    dbSet.weight_kg !== null
                      ? weightText(dbSet.weight_kg, unitRef.current)
                      : '',
                  weightKg: dbSet.weight_kg,
                  durationSeconds:
                    dbSet.duration_seconds !== null
                      ? dbSet.duration_seconds.toString()
                      : '',
                  completed: dbSet.completed_at !== null,
                  placeholderReps: isDur
                    ? undefined
                    : lastSet?.reps?.toString() || '8',
                  placeholderWeight: placeholderWeightText(
                    lastSet,
                    unitRef.current,
                  ),
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
    exercisesIncludingArchived,
    getWorkoutLogExercises,
    getWorkoutSets,
    isInitialized,
  ]);

  // Writes the TYPED values of a set (auto-save). Sets are pre-created when a
  // workout starts, so this is always an UPDATE, never an INSERT. A ref keeps
  // the debouncer (created once) calling the current function.
  const saveTypedValues = useCallback(
    async (setId: number, exerciseType: ExerciseType, setData: SetData) => {
      const { values } = resolveSetValues(
        setData,
        exerciseType,
        unitRef.current,
        { fillPlaceholders: false },
      );
      try {
        await updateSet(setId, values);
      } catch (err) {
        console.error('Failed to save set:', err);
      }
    },
    [updateSet],
  );
  const saveRef = useRef(saveTypedValues);
  saveRef.current = saveTypedValues;

  const [saveDebouncer] = useState(() =>
    keyedDebounce<number, [ExerciseType, SetData]>(
      (setId, type, setData) => saveRef.current(setId, type, setData),
      SAVE_DEBOUNCE_MS,
    ),
  );

  // Never lose a pending edit: flush when the page is hidden or unloaded
  // (a phone locking, the app being swiped away) and on unmount.
  useEffect(() => {
    const flush = () => {
      saveDebouncer.flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [saveDebouncer]);

  // Optimistic update: writes to local state immediately for responsive UI,
  // then schedules that set's debounced (500ms) save.
  const handleSetChange = useCallback(
    (
      exerciseIndex: number,
      setIndex: number,
      field: 'reps' | 'weight' | 'durationSeconds',
      value: string,
    ) => {
      const exerciseData = exercisesRef.current[exerciseIndex];
      const set = exerciseData?.sets[setIndex];
      if (!exerciseData || !set) return;

      commit((prev) => patchSet(prev, set.id, { [field]: value }));
      saveDebouncer.schedule(set.id, exerciseData.exerciseType, {
        ...set,
        [field]: value,
      });
    },
    [commit, saveDebouncer],
  );

  // Tapping Done: fill empty fields from their placeholders, store, mark
  // completed, and show the filled values as real ones.
  const completeOne = useCallback(
    async (exerciseType: ExerciseType, setData: SetData, seconds?: number) => {
      saveDebouncer.cancel(setData.id); // superseded by the full write below
      const source =
        seconds === undefined
          ? setData
          : { ...setData, durationSeconds: String(seconds) };
      const { values, cells } = resolveSetValues(
        source,
        exerciseType,
        unitRef.current,
        { fillPlaceholders: true },
      );
      await updateSet(setData.id, values);
      await completeSet(setData.id);
      commit((prev) =>
        patchSet(prev, setData.id, {
          reps: cells.reps,
          weight: cells.weight,
          durationSeconds: cells.durationSeconds,
          weightKg: values.weight_kg,
          completed: true,
        }),
      );
    },
    [saveDebouncer, updateSet, completeSet, commit],
  );

  // Mark a single set as completed (sets completed_at in DB)
  const handleCompleteSet = useCallback(
    async (exerciseIndex: number, setIndex: number): Promise<boolean> => {
      const loadingKey = `completeSet:${exerciseIndex}:${setIndex}`;
      const exerciseData = exercisesRef.current[exerciseIndex];
      if (!exerciseData || !activeWorkout) return false;

      const setData = exerciseData.sets[setIndex];
      if (!setData || setData.completed) return false; // Already completed

      setLoading(loadingKey, true);
      try {
        await completeOne(exerciseData.exerciseType, setData);
        return true;
      } catch (err) {
        console.error('Failed to complete set:', err);
        return false;
      } finally {
        setLoading(loadingKey, false);
      }
    },
    [activeWorkout, completeOne, setLoading],
  );

  // Uncomplete a set (user wants to edit it again)
  const handleUncompleteSet = useCallback(
    async (exerciseIndex: number, setIndex: number): Promise<boolean> => {
      const exerciseData = exercisesRef.current[exerciseIndex];
      if (!exerciseData || !activeWorkout) return false;

      const setData = exerciseData.sets[setIndex];
      if (!setData?.completed) return false; // Not completed

      try {
        await uncompleteSet(setData.id);
        commit((prev) => patchSet(prev, setData.id, { completed: false }));
        return true;
      } catch (err) {
        console.error('Failed to uncomplete set:', err);
        return false;
      }
    },
    [activeWorkout, uncompleteSet, commit],
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
      const targets = exerciseIndices.flatMap((exerciseIndex) => {
        const exerciseData = exercisesRef.current[exerciseIndex];
        const setData = exerciseData?.sets[roundNumber];
        return exerciseData && setData && !setData.completed
          ? [{ type: exerciseData.exerciseType, setData }]
          : [];
      });

      setLoading(loadingKey, true);
      try {
        for (const { type, setData } of targets) {
          await completeOne(type, setData);
        }
        return true;
      } catch (err) {
        console.error('Failed to complete round:', err);
        return false;
      } finally {
        setLoading(loadingKey, false);
      }
    },
    [activeWorkout, completeOne, setLoading],
  );

  // Add a new set to an exercise (inserts to DB and updates local state)
  const handleAddSet = useCallback(
    async (exerciseIndex: number) => {
      const loadingKey = `addSet:${exerciseIndex}`;
      const exerciseData = exercisesRef.current[exerciseIndex];
      if (!exerciseData) return;
      const wleId = exerciseData.workoutLogExercise.id;
      if (wleId <= 0) return; // Can't add to legacy exercise

      setLoading(loadingKey, true);
      try {
        const newSet = await addSetToExercise(wleId);
        // Placeholders from the exercise's last set as it is NOW.
        commit((prev) => {
          const current = prev.find((e) => e.workoutLogExercise.id === wleId);
          if (!current) return prev;
          return appendSet(prev, wleId, {
            ...emptySet(newSet),
            ...placeholdersAfter(
              current.sets[current.sets.length - 1],
              isDurationType(current.exerciseType),
            ),
          });
        });
      } catch (err) {
        console.error('Failed to add set:', err);
      } finally {
        setLoading(loadingKey, false);
      }
    },
    [addSetToExercise, commit, setLoading],
  );

  // Add a round to a superset (one set per member, one statement)
  const handleAddSetToSuperset = useCallback(
    async (exerciseIndices: number[]) => {
      const loadingKey = `addRound:${exerciseIndices[0]}`;
      if (!activeWorkout) return;

      const firstExercise = exercisesRef.current[exerciseIndices[0]];
      const supersetGroupId =
        firstExercise?.workoutLogExercise.superset_group_id;
      if (!supersetGroupId) return;

      setLoading(loadingKey, true);
      try {
        const newSets = await addRoundToSuperset(
          activeWorkout.id,
          supersetGroupId,
        );
        commit((prev) =>
          newSets.reduce((state, newSet) => {
            const owner = state.find(
              (e) => e.workoutLogExercise.id === newSet.workout_log_exercise_id,
            );
            if (!owner) return state;
            return appendSet(state, owner.workoutLogExercise.id, {
              ...emptySet(newSet),
              ...placeholdersAfter(
                owner.sets[owner.sets.length - 1],
                isDurationType(owner.exerciseType),
              ),
            });
          }, prev),
        );
      } catch (err) {
        console.error('Failed to add superset round:', err);
      } finally {
        setLoading(loadingKey, false);
      }
    },
    [activeWorkout, addRoundToSuperset, commit, setLoading],
  );

  // Delete the tapped set (by id) from DB and local state
  const handleDeleteSet = useCallback(
    async (exerciseIndex: number, setIndex: number) => {
      const loadingKey = `deleteSet:${exerciseIndex}`;
      const exerciseData = exercisesRef.current[exerciseIndex];
      if (!exerciseData) return;
      if (exerciseData.workoutLogExercise.id <= 0) return; // Can't remove from legacy

      // Don't allow removing if only 1 set left
      if (exerciseData.sets.length <= 1) return;
      const setId = exerciseData.sets[setIndex]?.id;
      if (setId === undefined) return;

      setLoading(loadingKey, true);
      try {
        saveDebouncer.cancel(setId);
        await deleteSets([setId]);
        commit((prev) => removeSets(prev, [setId]));
      } catch (err) {
        console.error('Failed to delete set:', err);
      } finally {
        setLoading(loadingKey, false);
      }
    },
    [deleteSets, saveDebouncer, commit, setLoading],
  );

  // Delete a specific round from all exercises in a superset
  // If only 1 round left, delete the entire superset (all exercises)
  const handleDeleteRound = useCallback(
    async (supersetExerciseIndices: number[], roundNumber: number) => {
      const loadingKey = `deleteRound:${supersetExerciseIndices[0]}`;
      if (!activeWorkout) return;

      const members = supersetExerciseIndices
        .map((i) => exercisesRef.current[i])
        .filter((e): e is ExerciseWithSets => !!e);
      const firstExercise = members[0];
      if (!firstExercise?.workoutLogExercise.superset_group_id) return;

      setLoading(loadingKey, true);
      try {
        // If only 1 round left, delete all exercises in the superset
        if (firstExercise.sets.length <= 1) {
          const wleIds = members.map((e) => e.workoutLogExercise.id);
          await deleteWorkoutLogExercises(wleIds.filter((id) => id > 0));
          commit((prev) => removeExercises(prev, wleIds));
          return;
        }

        const setIds = members.flatMap((e) => {
          const set = e.sets[roundNumber];
          return set ? [set.id] : [];
        });
        for (const id of setIds) saveDebouncer.cancel(id);
        await deleteSets(setIds); // one transaction, renumbers in DB
        commit((prev) => removeSets(prev, setIds));
      } catch (err) {
        console.error('Failed to delete round:', err);
      } finally {
        setLoading(loadingKey, false);
      }
    },
    [
      activeWorkout,
      deleteSets,
      deleteWorkoutLogExercises,
      saveDebouncer,
      commit,
      setLoading,
    ],
  );

  // Remove an exercise entirely (from workout_log_exercises and all its sets).
  // The card stays when the DB delete fails, so the UI never claims a removal
  // that did not happen.
  const handleRemoveExercise = useCallback(
    async (exerciseIndex: number): Promise<boolean> => {
      const exerciseData = exercisesRef.current[exerciseIndex];
      if (!exerciseData) return false;
      const wleId = exerciseData.workoutLogExercise.id;

      if (wleId > 0) {
        try {
          await deleteWorkoutLogExercises([wleId]);
        } catch (err) {
          console.error('Failed to delete workout log exercise:', err);
          return false;
        }
      }
      for (const set of exerciseData.sets) saveDebouncer.cancel(set.id);
      commit((prev) => removeExercises(prev, [wleId]));
      return true;
    },
    [deleteWorkoutLogExercises, saveDebouncer, commit],
  );

  // Link two or more existing exercises into a superset
  const handleLinkExercisesAsSuperset = useCallback(
    async (exerciseIndices: number[]) => {
      if (exerciseIndices.length < 2) return;

      const wleIds = exerciseIndices
        .map((i) => exercisesRef.current[i]?.workoutLogExercise.id)
        .filter((id): id is number => id !== undefined);
      const supersetGroupId = `ss-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      try {
        for (const id of wleIds) {
          if (id > 0) await updateWorkoutLogExercise(id, { supersetGroupId });
        }
        commit((prev) => setSupersetGroup(prev, wleIds, supersetGroupId));
      } catch (err) {
        console.error('Failed to link exercises as superset:', err);
      }
    },
    [updateWorkoutLogExercise, commit],
  );

  // Break a superset (remove superset_group_id from exercises)
  const handleBreakSuperset = useCallback(
    async (supersetGroupId: string) => {
      const wleIds = exercisesRef.current
        .filter(
          (ex) => ex.workoutLogExercise.superset_group_id === supersetGroupId,
        )
        .map((ex) => ex.workoutLogExercise.id);

      try {
        for (const id of wleIds) {
          if (id > 0) {
            await updateWorkoutLogExercise(id, { supersetGroupId: null });
          }
        }
        commit((prev) => setSupersetGroup(prev, wleIds, null));
      } catch (err) {
        console.error('Failed to break superset:', err);
      }
    },
    [updateWorkoutLogExercise, commit],
  );

  // Add a new exercise to the workout (with pre-created sets)
  const handleAddExercise = useCallback(
    async (exercise: Exercise, supersetGroupId?: string) => {
      if (!activeWorkout) return;

      const db = await getDB();
      const lastPerfSessions = await exerciseSessions(db, exercise.id, {
        completedSetsOnly: true,
        limit: 1,
        excludeWorkoutLogId: activeWorkout.id,
      });
      const lastPerf = lastPerfSessions[0]?.sets ?? null;
      const exerciseType = exercise.exercise_type || 'reps_weight';
      const isDuration = isDurationType(exerciseType);

      // Get current max order_index
      const maxOrderIndex = Math.max(
        0,
        ...exercisesRef.current.map((e) => e.workoutLogExercise.order_index),
      );

      try {
        const { exercise: newWorkoutLogExercise, sets: exerciseSets } =
          await addWorkoutLogExercise(activeWorkout.id, exercise.id, {
            orderIndex: maxOrderIndex + 1,
            supersetGroupId: supersetGroupId || null,
            targetSets: 3,
            targetRepMin: isDuration ? null : 8,
            targetRepMax: isDuration ? null : 12,
            targetDurationSeconds: isDuration ? 30 : null,
          });

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
            ...emptySet(dbSet),
            placeholderReps: isDuration
              ? undefined
              : lastSet?.reps?.toString() || '10',
            placeholderWeight: placeholderWeightText(lastSet, unitRef.current),
            placeholderDuration: isDuration ? '30' : undefined,
          };
        });

        const added: ExerciseWithSets = {
          workoutLogExercise: workoutLogExerciseWithDetails,
          exercise,
          exerciseType,
          sets,
          lastPerformance: lastPerf,
          isExpanded: true,
          notes: '',
        };
        commit((prev) => [...prev, added]);
      } catch (err) {
        console.error('Failed to add exercise:', err);
      }
    },
    [activeWorkout, addWorkoutLogExercise, commit],
  );

  // Toggle exercise expansion (synchronous, so the index is current)
  const toggleExerciseExpand = useCallback(
    (index: number) => {
      const id = exercisesRef.current[index]?.workoutLogExercise.id;
      if (id === undefined) return;
      commit((prev) =>
        patchExercise(prev, id, (ex) => ({
          ...ex,
          isExpanded: !ex.isExpanded,
        })),
      );
    },
    [commit],
  );

  // Update exercise notes
  const updateExerciseNotes = useCallback(
    (exerciseIndex: number, notes: string) => {
      const id = exercisesRef.current[exerciseIndex]?.workoutLogExercise.id;
      if (id === undefined) return;
      commit((prev) => patchExercise(prev, id, (ex) => ({ ...ex, notes })));
    },
    [commit],
  );

  // Save duration set (called when duration timer completes)
  const saveDurationSet = useCallback(
    async (exerciseIndex: number, setIndex: number, actualSeconds: number) => {
      if (!activeWorkout) return;

      const exerciseData = exercisesRef.current[exerciseIndex];
      const setData = exerciseData?.sets[setIndex];
      if (!exerciseData || !setData) return;

      try {
        await completeOne(exerciseData.exerciseType, setData, actualSeconds);
      } catch (err) {
        console.error('Failed to save duration set:', err);
      }
    },
    [activeWorkout, completeOne],
  );

  // End the workout, after every pending edit has been written
  const handleEndWorkout = useCallback(
    async (notes?: string) => {
      if (!activeWorkout) return;
      await saveDebouncer.flush();
      await endWorkout(activeWorkout.id, notes);
    },
    [activeWorkout, endWorkout, saveDebouncer],
  );

  // Cancel the workout (pending edits are moot: the log is deleted)
  const handleCancelWorkout = useCallback(async () => {
    if (!activeWorkout) return;
    saveDebouncer.cancel();
    await cancelWorkout(activeWorkout.id);
  }, [activeWorkout, cancelWorkout, saveDebouncer]);

  // Groups exercises for rendering: standalone exercises stay as-is, superset
  // exercises are collected into arrays. Uses a processedIndices set to avoid
  // double-counting exercises that share a superset_group_id.
  const groupedExercises = useMemo(() => {
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
  }, [exercisesWithSets]);

  const totalCompletedSets = useMemo(
    () =>
      exercisesWithSets.reduce(
        (sum, ex) => sum + ex.sets.filter((s) => s.completed).length,
        0,
      ),
    [exercisesWithSets],
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
    /** Every exercise, archived included: for looking one up by id. */
    allExercises: exercisesIncludingArchived,
    /** Live library exercises: for pickers. */
    libraryExercises,
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
