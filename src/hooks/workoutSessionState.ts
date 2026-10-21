import type {
  Exercise,
  ExerciseType,
  WorkoutLogExerciseWithDetails,
  WorkoutSet,
} from '../types';

// Pure updates of the session logger's state. Every update is keyed by a
// Workout Log Exercise id or Set id, never by array position: a handler that
// awaits a DB write must apply its result to the same row even if exercises
// were added or removed meanwhile.

export interface SetData {
  id: number; // Database ID - always present since sets are pre-created
  set_number: number;
  reps: string;
  /** In the user's display unit (see useWeightUnit); stored as kg. */
  weight: string;
  /** The kg value last loaded/saved for this set; keeps unedited saves exact. */
  weightKg?: number | null;
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

type State = ExerciseWithSets[];

const wleId = (ex: ExerciseWithSets) => ex.workoutLogExercise.id;

/** Merge `patch` into the Set with `setId`, wherever it now sits. */
export function patchSet(
  state: State,
  setId: number,
  patch: Partial<SetData>,
): State {
  return state.map((ex) =>
    ex.sets.some((s) => s.id === setId)
      ? {
          ...ex,
          sets: ex.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
        }
      : ex,
  );
}

/** Drop the given Sets and renumber what is left 1..n per exercise. */
export function removeSets(state: State, setIds: readonly number[]): State {
  const doomed = new Set(setIds);
  return state.map((ex) =>
    ex.sets.some((s) => doomed.has(s.id))
      ? {
          ...ex,
          sets: ex.sets
            .filter((s) => !doomed.has(s.id))
            .map((s, i) => ({ ...s, set_number: i + 1 })),
        }
      : ex,
  );
}

/** Append a Set to the exercise with Workout Log Exercise id `id`. */
export function appendSet(state: State, id: number, set: SetData): State {
  return state.map((ex) =>
    wleId(ex) === id ? { ...ex, sets: [...ex.sets, set] } : ex,
  );
}

export function removeExercises(state: State, ids: readonly number[]): State {
  return state.filter((ex) => !ids.includes(wleId(ex)));
}

export function patchExercise(
  state: State,
  id: number,
  update: (ex: ExerciseWithSets) => ExerciseWithSets,
): State {
  return state.map((ex) => (wleId(ex) === id ? update(ex) : ex));
}

export function setSupersetGroup(
  state: State,
  ids: readonly number[],
  supersetGroupId: string | null,
): State {
  return state.map((ex) =>
    ids.includes(wleId(ex))
      ? {
          ...ex,
          workoutLogExercise: {
            ...ex.workoutLogExercise,
            superset_group_id: supersetGroupId,
          },
        }
      : ex,
  );
}
