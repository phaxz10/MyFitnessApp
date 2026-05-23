import type {
  ExerciseType,
  ProgramExerciseWithDetails,
  WorkoutLogExerciseWithDetails,
} from '../types';

/**
 * Represents a single exercise in a normalized format for comparison
 */
export interface NormalizedExercise {
  exerciseId: number;
  exerciseName: string;
  exerciseType: ExerciseType;
  targetSets: number;
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetDurationSeconds: number | null;
  supersetGroupId: string | null;
  orderIndex: number;
}

/**
 * Represents the differences between session and program
 */
export interface SessionDiff {
  hasChanges: boolean;
  addedExercises: NormalizedExercise[];
  removedExercises: NormalizedExercise[];
  modifiedExercises: {
    exerciseId: number;
    exerciseName: string;
    changes: {
      field: string;
      oldValue: string | number | null;
      newValue: string | number | null;
    }[];
  }[];
  reordered: boolean;
  supersetChanges: boolean;
}

/**
 * Normalize a program exercise to a common format
 */
function normalizeProgramExercise(
  exercise: ProgramExerciseWithDetails,
): NormalizedExercise {
  return {
    exerciseId: exercise.exercise_id,
    exerciseName: exercise.exercise_name,
    exerciseType: exercise.exercise_type,
    targetSets: exercise.target_sets,
    targetRepMin: exercise.target_rep_min,
    targetRepMax: exercise.target_rep_max,
    targetDurationSeconds: exercise.target_duration_seconds,
    supersetGroupId: exercise.superset_group_id,
    orderIndex: exercise.order_index,
  };
}

/**
 * Normalize a workout log exercise to a common format
 */
function normalizeWorkoutLogExercise(
  exercise: WorkoutLogExerciseWithDetails,
  actualSetCount: number,
): NormalizedExercise {
  return {
    exerciseId: exercise.exercise_id,
    exerciseName: exercise.exercise_name || 'Unknown',
    exerciseType: exercise.exercise_type || 'reps_weight',
    targetSets: actualSetCount, // Use actual set count from workout
    targetRepMin: exercise.target_rep_min,
    targetRepMax: exercise.target_rep_max,
    targetDurationSeconds: exercise.target_duration_seconds,
    supersetGroupId: exercise.superset_group_id,
    orderIndex: exercise.order_index,
  };
}

/**
 * Compare two exercises and return the differences
 */
function compareExercises(
  original: NormalizedExercise,
  current: NormalizedExercise,
): {
  field: string;
  oldValue: string | number | null;
  newValue: string | number | null;
}[] {
  const changes: {
    field: string;
    oldValue: string | number | null;
    newValue: string | number | null;
  }[] = [];

  if (original.targetSets !== current.targetSets) {
    changes.push({
      field: 'sets',
      oldValue: original.targetSets,
      newValue: current.targetSets,
    });
  }

  if (original.targetRepMin !== current.targetRepMin) {
    changes.push({
      field: 'min reps',
      oldValue: original.targetRepMin,
      newValue: current.targetRepMin,
    });
  }

  if (original.targetRepMax !== current.targetRepMax) {
    changes.push({
      field: 'max reps',
      oldValue: original.targetRepMax,
      newValue: current.targetRepMax,
    });
  }

  if (original.targetDurationSeconds !== current.targetDurationSeconds) {
    changes.push({
      field: 'duration',
      oldValue: original.targetDurationSeconds,
      newValue: current.targetDurationSeconds,
    });
  }

  return changes;
}

// Superset group IDs are UUIDs generated at session instantiation time, so the
// same program session produces different IDs each workout. To detect whether
// superset *groupings* changed (not just IDs), we compare the sets of exercise
// IDs within each group — ignoring the group IDs themselves.
function getSupersetGroups(
  exercises: NormalizedExercise[],
): Map<string, number[]> {
  const groups = new Map<string, number[]>();

  exercises.forEach((ex) => {
    if (ex.supersetGroupId) {
      const existing = groups.get(ex.supersetGroupId) || [];
      existing.push(ex.exerciseId);
      groups.set(ex.supersetGroupId, existing);
    }
  });

  return groups;
}

/**
 * Compare superset groupings between program and session
 * Returns true if the grouping pattern is different
 */
function compareSupersetGroupings(
  programExercises: NormalizedExercise[],
  sessionExercises: NormalizedExercise[],
): boolean {
  const programGroups = getSupersetGroups(programExercises);
  const sessionGroups = getSupersetGroups(sessionExercises);

  // Convert to arrays of exercise ID sets for comparison
  const programGroupSets = Array.from(programGroups.values())
    .map((ids) => ids.sort().join(','))
    .sort();
  const sessionGroupSets = Array.from(sessionGroups.values())
    .map((ids) => ids.sort().join(','))
    .sort();

  // Compare the grouping patterns
  if (programGroupSets.length !== sessionGroupSets.length) {
    return true;
  }

  for (let i = 0; i < programGroupSets.length; i++) {
    if (programGroupSets[i] !== sessionGroupSets[i]) {
      return true;
    }
  }

  return false;
}

/**
 * Compare the current workout session against the original program template
 * and return a detailed diff of what changed
 */
export function compareSessionToProgram(
  programExercises: ProgramExerciseWithDetails[],
  workoutLogExercises: WorkoutLogExerciseWithDetails[],
  exerciseSetCounts: Map<number, number>, // workout_log_exercise_id -> actual set count
): SessionDiff {
  // Normalize both lists
  const programNormalized = programExercises.map(normalizeProgramExercise);
  const sessionNormalized = workoutLogExercises.map((wle) =>
    normalizeWorkoutLogExercise(
      wle,
      exerciseSetCounts.get(wle.id) || wle.target_sets || 3,
    ),
  );

  // Create maps for quick lookup
  const programByExerciseId = new Map(
    programNormalized.map((ex) => [ex.exerciseId, ex]),
  );
  const sessionByExerciseId = new Map(
    sessionNormalized.map((ex) => [ex.exerciseId, ex]),
  );

  // Find added exercises (in session but not in program)
  const addedExercises: NormalizedExercise[] = [];
  sessionNormalized.forEach((ex) => {
    if (!programByExerciseId.has(ex.exerciseId)) {
      addedExercises.push(ex);
    }
  });

  // Find removed exercises (in program but not in session)
  const removedExercises: NormalizedExercise[] = [];
  programNormalized.forEach((ex) => {
    if (!sessionByExerciseId.has(ex.exerciseId)) {
      removedExercises.push(ex);
    }
  });

  // Find modified exercises (in both but with different values)
  const modifiedExercises: SessionDiff['modifiedExercises'] = [];
  sessionNormalized.forEach((sessionEx) => {
    const programEx = programByExerciseId.get(sessionEx.exerciseId);
    if (programEx) {
      const changes = compareExercises(programEx, sessionEx);
      if (changes.length > 0) {
        modifiedExercises.push({
          exerciseId: sessionEx.exerciseId,
          exerciseName: sessionEx.exerciseName,
          changes,
        });
      }
    }
  });

  // Check if order changed (only for exercises that exist in both)
  const programOrder = programNormalized
    .filter((ex) => sessionByExerciseId.has(ex.exerciseId))
    .map((ex) => ex.exerciseId);
  const sessionOrder = sessionNormalized
    .filter((ex) => programByExerciseId.has(ex.exerciseId))
    .map((ex) => ex.exerciseId);
  const reordered = programOrder.join(',') !== sessionOrder.join(',');

  // Check if superset groupings changed
  const supersetChanges = compareSupersetGroupings(
    programNormalized,
    sessionNormalized,
  );

  const hasChanges =
    addedExercises.length > 0 ||
    removedExercises.length > 0 ||
    modifiedExercises.length > 0 ||
    reordered ||
    supersetChanges;

  return {
    hasChanges,
    addedExercises,
    removedExercises,
    modifiedExercises,
    reordered,
    supersetChanges,
  };
}

/**
 * Generate a human-readable summary of the changes
 */
export function generateChangeSummary(diff: SessionDiff): string[] {
  const summary: string[] = [];

  if (diff.addedExercises.length > 0) {
    const names = diff.addedExercises.map((ex) => ex.exerciseName).join(', ');
    summary.push(`Added: ${names}`);
  }

  if (diff.removedExercises.length > 0) {
    const names = diff.removedExercises.map((ex) => ex.exerciseName).join(', ');
    summary.push(`Removed: ${names}`);
  }

  diff.modifiedExercises.forEach((mod) => {
    const changeDescs = mod.changes.map((c) => {
      const oldVal = c.oldValue ?? 'none';
      const newVal = c.newValue ?? 'none';
      return `${c.field}: ${oldVal} → ${newVal}`;
    });
    summary.push(`${mod.exerciseName}: ${changeDescs.join(', ')}`);
  });

  if (diff.reordered) {
    summary.push('Exercise order changed');
  }

  if (diff.supersetChanges) {
    summary.push('Superset groupings changed');
  }

  return summary;
}
