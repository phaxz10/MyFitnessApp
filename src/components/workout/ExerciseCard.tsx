import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Dumbbell,
  MessageSquare,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import type { ExerciseWithSets, SetData } from '../../hooks/useWorkoutSession';
import type {
  AIExerciseCoachingResponse,
  ExerciseType,
  ProgressionDirection,
} from '../../types';
import { Input } from '../ui';

interface ExerciseCardProps {
  exerciseData: ExerciseWithSets;
  coaching?: AIExerciseCoachingResponse;
  onToggleExpand: () => void;
  onSetChange: (
    setIndex: number,
    field: 'reps' | 'weight' | 'durationSeconds',
    value: string,
  ) => void;
  onDeleteSet: (setIndex: number) => void;
  onAddSet: () => void;
  onStartDurationTimer: (setIndex: number) => void;
  onOpenNotes: () => void;
  onRemoveExercise: () => void;
}

// Get exercise type icon
const getExerciseTypeIcon = (type: ExerciseType) => {
  if (type === 'duration' || type === 'duration_weight') {
    return <Clock size={14} className="text-slate-400" />;
  }
  return <Dumbbell size={14} className="text-slate-400" />;
};

// Get progression arrow indicator
const getProgressionArrow = (direction: ProgressionDirection | undefined) => {
  if (!direction || direction === 'maintain') return null;
  if (direction === 'increase') {
    return <ChevronUp size={14} className="text-green-400" />;
  }
  return <ChevronDown size={14} className="text-red-400" />;
};

export function ExerciseCard({
  exerciseData,
  coaching,
  onToggleExpand,
  onSetChange,
  onDeleteSet,
  onAddSet,
  onStartDurationTimer,
  onOpenNotes,
  onRemoveExercise,
}: ExerciseCardProps) {
  const exerciseName =
    'exercise_name' in exerciseData.exercise
      ? exerciseData.exercise.exercise_name
      : exerciseData.exercise.name;

  const isDuration =
    exerciseData.exerciseType === 'duration' ||
    exerciseData.exerciseType === 'duration_weight';
  const hasWeight =
    exerciseData.exerciseType === 'reps_weight' ||
    exerciseData.exerciseType === 'duration_weight';

  // Get target info
  const targetRepMin =
    'target_rep_min' in exerciseData.exercise
      ? exerciseData.exercise.target_rep_min
      : null;
  const targetRepMax =
    'target_rep_max' in exerciseData.exercise
      ? exerciseData.exercise.target_rep_max
      : null;
  const targetDuration =
    'target_duration_seconds' in exerciseData.exercise
      ? exerciseData.exercise.target_duration_seconds
      : null;

  const targetInfo = isDuration
    ? targetDuration
      ? `${targetDuration}s`
      : null
    : targetRepMin && targetRepMax
      ? `${targetRepMin}-${targetRepMax} reps`
      : null;

  // Count saved sets (those with DB id)
  const savedSetsCount = exerciseData.sets.filter((s) => s.id).length;

  return (
    <>
      {/* Exercise Header */}
      <button
        type="button"
        className="flex items-center justify-between w-full text-left"
        onClick={onToggleExpand}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white">{exerciseName}</h3>
            {getExerciseTypeIcon(exerciseData.exerciseType)}
          </div>
          {targetInfo && (
            <p className="text-blue-400 text-sm">Target: {targetInfo}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-sm">
            {savedSetsCount}/{exerciseData.sets.length}
          </span>
          {exerciseData.isExpanded ? (
            <ChevronUp size={20} className="text-slate-400" />
          ) : (
            <ChevronDown size={20} className="text-slate-400" />
          )}
        </div>
      </button>

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
              <MessageSquare size={12} />
              Notes
            </button>
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
              const isSaved = !!set.id;

              return (
                <SetRow
                  key={set.tempId}
                  set={set}
                  setIndex={setIndex}
                  isDuration={isDuration}
                  hasWeight={hasWeight}
                  isSaved={isSaved}
                  targetRepMin={targetRepMin}
                  targetRepMax={targetRepMax}
                  targetDuration={targetDuration}
                  setCoaching={setCoaching}
                  onSetChange={onSetChange}
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
            className="mt-2 text-blue-400 text-sm flex items-center gap-1 hover:text-blue-300"
          >
            <Plus size={14} />
            Add Set
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
  isSaved: boolean;
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetDuration: number | null;
  setCoaching?: { reps?: ProgressionDirection; weight?: ProgressionDirection };
  onSetChange: (
    setIndex: number,
    field: 'reps' | 'weight' | 'durationSeconds',
    value: string,
  ) => void;
  onDelete: () => void;
  onStartTimer: () => void;
}

function SetRow({
  set,
  setIndex,
  isDuration,
  hasWeight,
  isSaved,
  targetRepMin,
  targetRepMax,
  targetDuration,
  setCoaching,
  onSetChange,
  onDelete,
  onStartTimer,
}: SetRowProps) {
  return (
    <div
      className={`flex items-center gap-2 py-1.5 px-2 rounded ${
        isSaved ? 'bg-green-900/30' : 'bg-slate-800/50'
      }`}
    >
      {/* Set Number */}
      <span className="w-6 text-center text-sm font-medium text-slate-400">
        {setIndex + 1}
      </span>

      {/* Weight Input */}
      {hasWeight && (
        <div className="flex items-center gap-1">
          {!isSaved && getProgressionArrow(setCoaching?.weight)}
          <Input
            type="number"
            value={set.weight}
            onChange={(e) => onSetChange(setIndex, 'weight', e.target.value)}
            className="w-16 h-8 text-center text-sm p-1"
            placeholder="lbs"
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
            className="w-16 h-8 text-center text-sm p-1"
            placeholder="sec"
          />
          <span className="text-slate-500 text-xs">sec</span>
          {!isSaved && targetDuration && (
            <span className="text-blue-400 text-xs">({targetDuration}s)</span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1">
          {!isSaved && getProgressionArrow(setCoaching?.reps)}
          <Input
            type="number"
            value={set.reps}
            onChange={(e) => onSetChange(setIndex, 'reps', e.target.value)}
            className="w-14 h-8 text-center text-sm p-1"
            placeholder="reps"
          />
          {!isSaved && targetRepMin && targetRepMax && (
            <span className="text-blue-400 text-xs whitespace-nowrap">
              ({targetRepMin}-{targetRepMax})
            </span>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1 ml-auto">
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 text-red-400/70 hover:text-red-400 hover:bg-red-900/30 rounded transition-colors"
        >
          <Trash2 size={16} />
        </button>
        {isDuration && !isSaved && (
          <button
            type="button"
            onClick={onStartTimer}
            className="p-1.5 text-green-400 hover:bg-green-900/30 rounded transition-colors"
          >
            <Play size={16} />
          </button>
        )}
        {isSaved && <Check size={16} className="text-green-400 mx-1.5" />}
      </div>
    </div>
  );
}
