import type { ExerciseType } from '../types';
import { parseWeightInput, type WeightUnit } from './units';

/** The cell text of one Set as the logger holds it (display unit). */
export interface SetCells {
  reps: string;
  weight: string;
  weightKg?: number | null;
  durationSeconds: string;
  placeholderReps?: string;
  placeholderWeight?: string;
  placeholderDuration?: string;
}

export interface SetValues {
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
}

function parseIntOrNull(value: string | undefined | null): number | null {
  if (!value || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function hasWeight(type: ExerciseType): boolean {
  return type === 'reps_weight' || type === 'duration_weight';
}

export function isDuration(type: ExerciseType): boolean {
  return type === 'duration' || type === 'duration_weight';
}

/**
 * The values to store for a Set, plus the cells the logger should show.
 *
 * Product rule: tapping Done (`fillPlaceholders: true`) fills each field left
 * empty from the placeholder it shows (last session's value or the target),
 * and the returned cells carry those as real values. Auto-save while typing
 * (`fillPlaceholders: false`) stores only what was typed. A weight that is
 * empty with no placeholder, or on an exercise that takes no weight, is NULL,
 * never 0. Fields the exercise type does not measure are NULL.
 */
export function resolveSetValues(
  set: SetCells,
  exerciseType: ExerciseType,
  unit: WeightUnit,
  opts: { fillPlaceholders: boolean },
): { values: SetValues; cells: SetCells } {
  const fill = (typed: string, placeholder: string | undefined) => {
    const text = typed.trim();
    return text === '' && opts.fillPlaceholders ? (placeholder ?? '') : text;
  };
  const duration = isDuration(exerciseType);
  const weighted = hasWeight(exerciseType);

  const reps = duration ? '' : fill(set.reps, set.placeholderReps);
  const weight = weighted ? fill(set.weight, set.placeholderWeight) : '';
  const seconds = duration
    ? fill(set.durationSeconds, set.placeholderDuration)
    : '';

  return {
    values: {
      reps: duration ? null : parseIntOrNull(reps),
      weight_kg:
        weighted && weight !== ''
          ? parseWeightInput(weight, unit, set.weightKg)
          : null,
      duration_seconds: duration ? parseIntOrNull(seconds) : null,
    },
    cells: {
      ...set,
      reps: duration ? set.reps : reps,
      weight: weighted ? weight : set.weight,
      durationSeconds: duration ? seconds : set.durationSeconds,
    },
  };
}
