import {
  ChevronDown,
  Combine,
  Loader2,
  PencilLine,
  Plus,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useWeightUnit } from '../../hooks/useWeightUnit';
import type { ExerciseWithSets, SetData } from '../../hooks/useWorkoutSession';
import type {
  AIExerciseCoachingResponse,
  ProgressionDirection,
} from '../../types';
import { unitLabel } from '../../utils/units';
import { getProgressionArrow } from '../../utils/workoutHelpers';
import { Button, ExerciseMark } from '../ui';
import {
  CoachingTip,
  DoneButton,
  exerciseKind,
  formatPrevious,
  NumberCell,
  type SetField,
  StartHoldButton,
  ToolButton,
} from './SetCells';

interface ExerciseCardProps {
  exerciseData: ExerciseWithSets;
  exerciseIndex: number;
  coaching?: AIExerciseCoachingResponse;
  isSelectedForLink?: boolean;
  isLoading: (key: string) => boolean;
  onToggleExpand: () => void;
  onSetChange: (setIndex: number, field: SetField, value: string) => void;
  onCompleteSet: (setIndex: number) => void;
  onUncompleteSet: (setIndex: number) => void;
  onDeleteSet: (setIndex: number) => void;
  onAddSet: () => void;
  onStartDurationTimer: (setIndex: number) => void;
  onOpenNotes: () => void;
  onExerciseNameClick?: () => void;
  onRemoveExercise: () => void;
  onLinkExercise?: () => void;
}

// Fixed columns: set # / previous / weight / reps (or sec) / done.
const SET_GRID =
  'grid grid-cols-[2.75rem_3.75rem_minmax(0,1fr)_minmax(0,1fr)_3rem] items-center gap-2';

export function ExerciseCard({
  exerciseData,
  exerciseIndex,
  coaching,
  isSelectedForLink,
  isLoading,
  onToggleExpand,
  onSetChange,
  onCompleteSet,
  onUncompleteSet,
  onDeleteSet,
  onAddSet,
  onStartDurationTimer,
  onOpenNotes,
  onExerciseNameClick,
  onRemoveExercise,
  onLinkExercise,
}: ExerciseCardProps) {
  const [editing, setEditing] = useState(false);
  const weightUnit = useWeightUnit();
  const { exercise, workoutLogExercise, sets } = exerciseData;
  const { isDuration, hasWeight } = exerciseKind(exerciseData.exerciseType);

  const isAddingSet = isLoading(`addSet:${exerciseIndex}`);
  const isDeletingSet = isLoading(`deleteSet:${exerciseIndex}`);

  const targetRepMin = workoutLogExercise.target_rep_min;
  const targetRepMax = workoutLogExercise.target_rep_max;
  const targetDuration = workoutLogExercise.target_duration_seconds;

  const targetInfo = isDuration
    ? targetDuration
      ? `${targetDuration}s`
      : null
    : targetRepMin && targetRepMax
      ? `${targetRepMin}–${targetRepMax} reps`
      : null;

  const completedSetsCount = sets.filter((s) => s.completed).length;
  const nextSetIndex = sets.findIndex((s) => !s.completed);
  const allDone = sets.length > 0 && nextSetIndex === -1;

  return (
    <>
      {/* Exercise header */}
      <div className="flex items-center gap-3">
        <ExerciseMark
          name={exercise.name}
          muscleGroups={exercise.muscle_groups}
        />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExerciseNameClick?.();
            }}
            className="block min-h-11 max-w-full truncate py-2.5 text-left text-base leading-6 font-bold text-ink hover:text-train-ink"
          >
            {exercise.name}
          </button>
          {targetInfo && (
            <p className="text-sm text-ink-2">
              Target <span className="num font-semibold">{targetInfo}</span>
            </p>
          )}
        </div>
        <span
          className={`num text-xl font-bold ${allDone ? 'text-train-ink' : 'text-ink'}`}
        >
          {completedSetsCount}
          <span className="text-ink-3">/{sets.length}</span>
        </span>
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={exerciseData.isExpanded}
          aria-label={exerciseData.isExpanded ? 'Collapse sets' : 'Show sets'}
          className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-sunken"
        >
          <ChevronDown
            size={22}
            className={`transition-transform ${exerciseData.isExpanded ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {exerciseData.isExpanded && (
        <div className="mt-4 space-y-3">
          {coaching?.coachingTip && (
            <CoachingTip>{coaching.coachingTip}</CoachingTip>
          )}

          {/* Column heads */}
          <div className={`${SET_GRID} px-1 text-xs font-medium text-ink-3`}>
            <span className="text-center">Set</span>
            <span>Previous</span>
            <span className="text-center">
              {hasWeight ? unitLabel(weightUnit) : ''}
            </span>
            <span className="text-center">{isDuration ? 'sec' : 'Reps'}</span>
            <span className="text-center">Done</span>
          </div>

          <div className="space-y-1.5">
            {sets.length === 0 && (
              <p className="py-3 text-center text-sm text-ink-2">
                No sets yet. Add one to start logging.
              </p>
            )}
            {sets.map((set, setIndex) => (
              <SetRow
                key={set.id}
                set={set}
                setIndex={setIndex}
                isNext={setIndex === nextSetIndex}
                editing={editing}
                isDuration={isDuration}
                hasWeight={hasWeight}
                unit={unitLabel(weightUnit)}
                previous={formatPrevious(
                  exerciseData.lastPerformance?.[setIndex],
                  isDuration,
                  hasWeight,
                  weightUnit,
                )}
                setCoaching={coaching?.sets?.[setIndex]}
                isCompleting={isLoading(
                  `completeSet:${exerciseIndex}:${setIndex}`,
                )}
                isDeleting={isDeletingSet}
                onSetChange={onSetChange}
                onComplete={() => onCompleteSet(setIndex)}
                onUncomplete={() => onUncompleteSet(setIndex)}
                onDelete={() => onDeleteSet(setIndex)}
                onStartTimer={() => onStartDurationTimer(setIndex)}
              />
            ))}
          </div>

          <Button
            variant="secondary"
            className="w-full"
            onClick={onAddSet}
            isLoading={isAddingSet}
          >
            {!isAddingSet && <Plus size={18} />}
            {isAddingSet ? 'Adding...' : 'Add Set'}
          </Button>

          {/* Exercise tools */}
          <div className="-mx-1 flex flex-wrap items-center gap-1 border-t border-line pt-2">
            <ToolButton onClick={onOpenNotes} icon={<PencilLine size={16} />}>
              Notes
            </ToolButton>
            {onLinkExercise && (
              <ToolButton
                onClick={onLinkExercise}
                pressed={isSelectedForLink}
                icon={<Combine size={16} />}
              >
                {isSelectedForLink ? 'Selected' : 'Superset'}
              </ToolButton>
            )}
            <ToolButton
              onClick={() => setEditing((v) => !v)}
              pressed={editing}
              icon={<SquarePen size={16} />}
            >
              {editing ? 'Done editing' : 'Edit sets'}
            </ToolButton>
            <span className="ml-auto">
              <ToolButton
                onClick={onRemoveExercise}
                tone="danger"
                icon={<Trash2 size={16} />}
              >
                Remove
              </ToolButton>
            </span>
          </div>
        </div>
      )}
    </>
  );
}

interface SetRowProps {
  set: SetData;
  setIndex: number;
  isNext: boolean;
  editing: boolean;
  isDuration: boolean;
  hasWeight: boolean;
  unit: string;
  previous: string;
  setCoaching?: { reps?: ProgressionDirection; weight?: ProgressionDirection };
  isCompleting: boolean;
  isDeleting: boolean;
  onSetChange: (setIndex: number, field: SetField, value: string) => void;
  onComplete: () => void;
  onUncomplete: () => void;
  onDelete: () => void;
  onStartTimer: () => void;
}

function SetRow({
  set,
  setIndex,
  isNext,
  editing,
  isDuration,
  hasWeight,
  unit,
  previous,
  setCoaching,
  isCompleting,
  isDeleting,
  onSetChange,
  onComplete,
  onUncomplete,
  onDelete,
  onStartTimer,
}: SetRowProps) {
  const isCompleted = set.completed;
  const label = `set ${setIndex + 1}`;

  return (
    <div
      className={`${SET_GRID} rounded-xl px-1 py-1.5 transition-colors ${
        isCompleted ? 'bg-train-soft' : ''
      }`}
    >
      {/* Set number (delete while editing) */}
      {editing && !isCompleted ? (
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          aria-label={`Delete ${label}`}
          className="grid size-11 place-items-center rounded-lg text-danger hover:bg-danger-soft disabled:opacity-50"
        >
          {isDeleting ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Trash2 size={18} />
          )}
        </button>
      ) : (
        <span
          className={`num mx-auto grid size-8 place-items-center rounded-lg text-base font-bold ${
            isNext ? 'bg-train text-on-accent' : 'text-ink-2'
          }`}
        >
          {setIndex + 1}
        </span>
      )}

      <span className="num truncate text-sm text-ink-3">{previous}</span>

      {hasWeight ? (
        <NumberCell
          label={`Weight for ${label}, ${unit}`}
          value={set.weight}
          placeholder={set.placeholderWeight || '0'}
          disabled={isCompleted}
          onChange={(v) => onSetChange(setIndex, 'weight', v)}
          hint={!isCompleted && getProgressionArrow(setCoaching?.weight)}
        />
      ) : (
        <span className="text-center text-sm text-ink-3">—</span>
      )}

      {isDuration ? (
        <NumberCell
          label={`Seconds for ${label}`}
          value={set.durationSeconds}
          placeholder={set.placeholderDuration || '0'}
          disabled={isCompleted}
          onChange={(v) => onSetChange(setIndex, 'durationSeconds', v)}
        />
      ) : (
        <NumberCell
          label={`Reps for ${label}`}
          value={set.reps}
          placeholder={set.placeholderReps || '0'}
          disabled={isCompleted}
          onChange={(v) => onSetChange(setIndex, 'reps', v)}
          hint={!isCompleted && getProgressionArrow(setCoaching?.reps)}
        />
      )}

      {isDuration && !isCompleted ? (
        <StartHoldButton label={label} onClick={onStartTimer} />
      ) : (
        <DoneButton
          completed={isCompleted}
          isNext={isNext}
          loading={isCompleting}
          label={label}
          onComplete={onComplete}
          onUncomplete={onUncomplete}
        />
      )}
    </div>
  );
}
