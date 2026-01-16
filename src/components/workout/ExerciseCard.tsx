import {
  Check,
  ChevronDown,
  ChevronUp,
  Combine,
  Loader2,
  PencilLine,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { ExerciseWithSets, SetData } from '../../hooks/useWorkoutSession';
import type {
  AIExerciseCoachingResponse,
  ProgressionDirection,
} from '../../types';
import {
  getExerciseTypeIcon,
  getProgressionArrow,
} from '../../utils/workoutHelpers';
import { Input } from '../ui';

interface ExerciseCardProps {
  exerciseData: ExerciseWithSets;
  exerciseIndex: number;
  coaching?: AIExerciseCoachingResponse;
  isSelectedForLink?: boolean;
  isLoading: (key: string) => boolean;
  onToggleExpand: () => void;
  onSetChange: (
    setIndex: number,
    field: 'reps' | 'weight' | 'durationSeconds',
    value: string,
  ) => void;
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
  const exerciseName = exerciseData.exercise.name;

  const isDuration =
    exerciseData.exerciseType === 'duration' ||
    exerciseData.exerciseType === 'duration_weight';
  const hasWeight =
    exerciseData.exerciseType === 'reps_weight' ||
    exerciseData.exerciseType === 'duration_weight';

  // Loading states
  const isAddingSet = isLoading(`addSet:${exerciseIndex}`);
  const isDeletingSet = isLoading(`deleteSet:${exerciseIndex}`);

  // Get target info from workoutLogExercise
  const targetRepMin = exerciseData.workoutLogExercise.target_rep_min;
  const targetRepMax = exerciseData.workoutLogExercise.target_rep_max;
  const targetDuration =
    exerciseData.workoutLogExercise.target_duration_seconds;

  const targetInfo = isDuration
    ? targetDuration
      ? `${targetDuration}s`
      : null
    : targetRepMin && targetRepMax
      ? `${targetRepMin}-${targetRepMax} reps`
      : null;

  // Count completed sets
  const completedSetsCount = exerciseData.sets.filter(
    (s) => s.completed,
  ).length;

  return (
    <>
      {/* Exercise Header */}
      <div className="flex items-center justify-between w-full text-left">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExerciseNameClick?.();
              }}
              className="font-semibold text-white hover:text-blue-400 transition-colors underline decoration-dotted underline-offset-2"
            >
              {exerciseName}
            </button>
            {getExerciseTypeIcon(exerciseData.exerciseType)}
          </div>
          {targetInfo && (
            <p className="text-blue-400 text-sm">Target: {targetInfo}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-sm">
            {completedSetsCount}/{exerciseData.sets.length}
          </span>
          <button
            type="button"
            onClick={onToggleExpand}
            className="p-2 hover:bg-slate-700/50 rounded transition-colors"
          >
            {exerciseData.isExpanded ? (
              <ChevronUp size={20} className="text-slate-400" />
            ) : (
              <ChevronDown size={20} className="text-slate-400" />
            )}
          </button>
        </div>
      </div>

      {/* Sets */}
      {exerciseData.isExpanded && (
        <div className="mt-3">
          {/* AI Coaching Tip */}
          {coaching?.coachingTip && (
            <div className="mb-2 px-2 py-1.5 bg-blue-900/30 border border-blue-700/50 rounded text-xs text-blue-300">
              {coaching.coachingTip}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              onClick={onOpenNotes}
              className="px-2 py-1.5 text-xs bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded text-slate-300 flex items-center gap-1.5 transition-colors"
            >
              <PencilLine size={12} />
              Notes
            </button>
            {onLinkExercise && (
              <button
                type="button"
                onClick={onLinkExercise}
                className={`px-2 py-1.5 text-xs border rounded flex items-center gap-1.5 transition-colors ${
                  isSelectedForLink
                    ? 'bg-purple-900/50 border-purple-500/50 text-purple-300'
                    : 'bg-slate-700/50 hover:bg-purple-900/30 border-slate-600 hover:border-purple-500/50 text-slate-300 hover:text-purple-300'
                }`}
              >
                <Combine size={12} />
                {isSelectedForLink ? 'Selected' : 'Superset'}
              </button>
            )}
            <button
              type="button"
              onClick={onRemoveExercise}
              className="px-2 py-1.5 text-xs bg-red-900/30 hover:bg-red-900/50 border border-red-700/50 rounded text-red-400 flex items-center gap-1.5 transition-colors ml-auto"
            >
              <Trash2 size={12} />
              Remove
            </button>
          </div>

          {/* Sets List */}
          <div className="space-y-1.5">
            {exerciseData.sets.map((set, setIndex) => {
              const setCoaching = coaching?.sets?.[setIndex];
              const isCompletingSet = isLoading(
                `completeSet:${exerciseIndex}:${setIndex}`,
              );

              return (
                <SetRow
                  key={set.id}
                  set={set}
                  setIndex={setIndex}
                  isDuration={isDuration}
                  hasWeight={hasWeight}
                  targetRepMin={targetRepMin}
                  targetRepMax={targetRepMax}
                  targetDuration={targetDuration}
                  setCoaching={setCoaching}
                  isCompleting={isCompletingSet}
                  isDeleting={isDeletingSet}
                  onSetChange={onSetChange}
                  onComplete={() => onCompleteSet(setIndex)}
                  onUncomplete={() => onUncompleteSet(setIndex)}
                  onDelete={() => onDeleteSet(setIndex)}
                  onStartTimer={() => onStartDurationTimer(setIndex)}
                />
              );
            })}
          </div>

          {/* Add Set Button */}
          <button
            type="button"
            onClick={onAddSet}
            disabled={isAddingSet}
            className="mt-2 text-blue-400 text-sm flex items-center gap-1 hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAddingSet ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            {isAddingSet ? 'Adding...' : 'Add Set'}
          </button>
        </div>
      )}
    </>
  );
}

// Individual Set Row Component
interface SetRowProps {
  set: SetData;
  setIndex: number;
  isDuration: boolean;
  hasWeight: boolean;
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetDuration: number | null;
  setCoaching?: { reps?: ProgressionDirection; weight?: ProgressionDirection };
  isCompleting?: boolean;
  isDeleting?: boolean;
  onSetChange: (
    setIndex: number,
    field: 'reps' | 'weight' | 'durationSeconds',
    value: string,
  ) => void;
  onComplete: () => void;
  onUncomplete: () => void;
  onDelete: () => void;
  onStartTimer: () => void;
}

function SetRow({
  set,
  setIndex,
  isDuration,
  hasWeight,
  targetRepMin,
  targetRepMax,
  targetDuration,
  setCoaching,
  isCompleting = false,
  isDeleting = false,
  onSetChange,
  onComplete,
  onUncomplete,
  onDelete,
  onStartTimer,
}: SetRowProps) {
  const isCompleted = set.completed;

  return (
    <div
      className={`flex items-center gap-2 py-1.5 px-2 rounded ${
        isCompleted ? 'bg-green-900/30' : 'bg-slate-800/50'
      }`}
    >
      {/* Set Number */}
      <span className="w-6 text-center text-sm font-medium text-slate-400">
        {setIndex + 1}
      </span>

      {/* Weight Input */}
      {hasWeight && (
        <div className="flex items-center gap-1">
          {!isCompleted && getProgressionArrow(setCoaching?.weight)}
          <Input
            type="number"
            value={set.weight}
            onChange={(e) => onSetChange(setIndex, 'weight', e.target.value)}
            onFocus={(e) => e.target.select()}
            className="w-16 h-8 text-center text-sm p-1"
            placeholder={set.placeholderWeight || 'lbs'}
            disabled={isCompleted}
          />
          <span className="text-slate-500 text-xs">lbs</span>
        </div>
      )}

      {/* Separator */}
      {hasWeight && <span className="text-slate-600 text-sm">x</span>}

      {/* Reps or Duration Input */}
      {isDuration ? (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={set.durationSeconds}
            onChange={(e) =>
              onSetChange(setIndex, 'durationSeconds', e.target.value)
            }
            onFocus={(e) => e.target.select()}
            className="w-16 h-8 text-center text-sm p-1"
            placeholder={set.placeholderDuration || 'sec'}
            disabled={isCompleted}
          />
          <span className="text-slate-500 text-xs">sec</span>
          {!isCompleted && targetDuration && (
            <span className="text-blue-400 text-xs">({targetDuration}s)</span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1">
          {!isCompleted && getProgressionArrow(setCoaching?.reps)}
          <Input
            type="number"
            value={set.reps}
            onChange={(e) => onSetChange(setIndex, 'reps', e.target.value)}
            onFocus={(e) => e.target.select()}
            className="w-14 h-8 text-center text-sm p-1"
            placeholder={set.placeholderReps || 'reps'}
            disabled={isCompleted}
          />
          {!isCompleted && targetRepMin && targetRepMax && (
            <span className="text-blue-400 text-xs whitespace-nowrap">
              ({targetRepMin}-{targetRepMax})
            </span>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1 ml-auto">
        {!isCompleted && (
          <>
            <button
              type="button"
              onClick={onDelete}
              disabled={isDeleting}
              className="p-1.5 text-red-400/70 hover:text-red-400 hover:bg-red-900/30 rounded transition-colors disabled:opacity-50"
            >
              {isDeleting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Trash2 size={16} />
              )}
            </button>
            {isDuration ? (
              <button
                type="button"
                onClick={onStartTimer}
                className="p-1.5 text-green-400 hover:bg-green-900/30 rounded transition-colors"
              >
                <Play size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={onComplete}
                disabled={isCompleting}
                className="p-1.5 text-green-400/70 hover:text-green-400 hover:bg-green-900/30 rounded transition-colors disabled:opacity-50"
              >
                {isCompleting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Check size={16} />
                )}
              </button>
            )}
          </>
        )}
        {isCompleted && (
          <button
            type="button"
            onClick={onUncomplete}
            className="p-1.5 text-orange-400/70 hover:text-orange-400 hover:bg-orange-900/30 rounded transition-colors"
            title="Mark as incomplete to edit"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
