import { Dumbbell, Link2, Trash2 } from 'lucide-react';
import type { UseFormRegister } from 'react-hook-form';
import { ExerciseMark } from '../ui';
import { NumberInput } from './NumberInput';
import {
  EXERCISE_TYPE_LABELS,
  type ExerciseFormData,
  isDurationType,
  type ProgramFormData,
} from './schema';

interface ExerciseRowProps {
  exercise: ExerciseFormData;
  exerciseIndex: number;
  sessionIndex: number;
  muscleGroups?: string;
  register: UseFormRegister<ProgramFormData>;
  isInSuperset: boolean;
  isSelectedForSuperset: boolean;
  onSupersetTap: () => void;
  onDelete: () => void;
}

export function ExerciseRow({
  exercise,
  exerciseIndex,
  sessionIndex,
  muscleGroups,
  register,
  isInSuperset,
  isSelectedForSuperset,
  onSupersetTap,
  onDelete,
}: ExerciseRowProps) {
  const isDuration = isDurationType(exercise.exerciseType);
  const hasWeight =
    exercise.exerciseType === 'reps_weight' ||
    exercise.exerciseType === 'duration_weight';
  const typeInfo = EXERCISE_TYPE_LABELS[exercise.exerciseType];
  const TypeIcon = typeInfo?.icon || Dumbbell;
  const path = `sessions.${sessionIndex}.exercises.${exerciseIndex}` as const;

  return (
    <li className={`px-4 py-3 ${isSelectedForSuperset ? 'bg-train-soft' : ''}`}>
      <div className="flex items-center gap-3">
        <ExerciseMark
          name={exercise.exerciseName}
          muscleGroups={muscleGroups}
          size={36}
        />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink truncate">
            {exercise.exerciseName}
          </p>
          <p className="flex items-center gap-1 text-sm text-ink-3">
            <TypeIcon size={14} aria-hidden="true" />
            {typeInfo?.label}
          </p>
        </div>

        {/* Superset toggle: only when NOT already in a superset */}
        {!isInSuperset && (
          <button
            type="button"
            onClick={onSupersetTap}
            aria-pressed={isSelectedForSuperset}
            aria-label={
              isSelectedForSuperset
                ? 'Click another exercise to link'
                : 'Create superset'
            }
            title={
              isSelectedForSuperset
                ? 'Click another exercise to link'
                : 'Create superset'
            }
            className={`grid place-items-center size-11 rounded-lg transition-colors ${
              isSelectedForSuperset
                ? 'bg-train text-on-accent'
                : 'text-ink-2 hover:text-train-ink hover:bg-sunken'
            }`}
          >
            <Link2 size={18} />
          </button>
        )}

        <button
          type="button"
          onClick={onDelete}
          aria-label={`Remove ${exercise.exerciseName}`}
          className="grid place-items-center size-11 rounded-lg text-ink-2 hover:text-danger hover:bg-sunken transition-colors"
        >
          <Trash2 size={18} />
        </button>
      </div>

      {/* Targets */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
        {/* Sets: hidden inside a superset (the group shares one value) */}
        {!isInSuperset && (
          <div className="flex items-center gap-2 text-sm text-ink-2">
            <label htmlFor={`${path}.targetSets`}>Sets</label>
            <NumberInput
              id={`${path}.targetSets`}
              {...register(`${path}.targetSets`, { valueAsNumber: true })}
              min={1}
            />
          </div>
        )}

        {!isDuration && (
          <div className="flex items-center gap-2 text-sm text-ink-2">
            <span aria-hidden="true">Reps</span>
            <NumberInput
              aria-label="Minimum reps"
              {...register(`${path}.targetRepMin`, { valueAsNumber: true })}
              min={1}
            />
            <span className="text-ink-3" aria-hidden="true">
              –
            </span>
            <NumberInput
              aria-label="Maximum reps"
              {...register(`${path}.targetRepMax`, { valueAsNumber: true })}
              min={1}
            />
          </div>
        )}

        {isDuration && (
          <div className="flex items-center gap-2 text-sm text-ink-2">
            <label htmlFor={`${path}.targetDurationSeconds`}>Time</label>
            <NumberInput
              id={`${path}.targetDurationSeconds`}
              {...register(`${path}.targetDurationSeconds`, {
                valueAsNumber: true,
              })}
              className="w-16"
              min={1}
              placeholder="sec"
            />
            <span className="text-ink-3">sec</span>
          </div>
        )}

        {hasWeight && <span className="text-sm text-ink-3">+ weight</span>}
      </div>
    </li>
  );
}
