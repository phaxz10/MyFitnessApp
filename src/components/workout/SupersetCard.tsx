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
import type { ExerciseWithSets } from '../../hooks/useWorkoutSession';
import type {
  AIExerciseCoachingResponse,
  ExerciseType,
  ProgressionDirection,
} from '../../types';
import { Input } from '../ui';

interface SupersetCardProps {
  supersetExercises: ExerciseWithSets[];
  exerciseIndices: number[];
  coachingMap: Map<number, AIExerciseCoachingResponse>;
  onToggleExpand: () => void;
  onSetChange: (
    exerciseIndex: number,
    setIndex: number,
    field: 'reps' | 'weight' | 'durationSeconds',
    value: string,
  ) => void;
  onDeleteRound: (roundNumber: number) => void;
  onAddRound: () => void;
  onStartDurationTimer: (exerciseIndex: number, setIndex: number) => void;
  onOpenNotes: (
    exerciseIndex: number,
    exerciseName: string,
    currentWeight: string,
  ) => void;
  getExerciseId: (exercise: ExerciseWithSets['exercise']) => number;
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

export function SupersetCard({
  supersetExercises,
  exerciseIndices,
  coachingMap,
  onToggleExpand,
  onSetChange,
  onDeleteRound,
  onAddRound,
  onStartDurationTimer,
  onOpenNotes,
  getExerciseId,
}: SupersetCardProps) {
  const maxSets = Math.max(...supersetExercises.map((ex) => ex.sets.length));
  const allExpanded = supersetExercises.every((ex) => ex.isExpanded);

  // Calculate totals
  const totalSavedSets = supersetExercises.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => s.id).length,
    0,
  );
  const totalSetsInSuperset = supersetExercises.reduce(
    (sum, ex) => sum + ex.sets.length,
    0,
  );

  // Check if a round is complete (all sets saved)
  const isRoundComplete = (roundNumber: number): boolean => {
    return supersetExercises.every((ex) => {
      const set = ex.sets[roundNumber];
      return set?.id;
    });
  };

  return (
    <>
      {/* Superset Header */}
      <button
        type="button"
        className="flex items-center justify-between w-full text-left mb-4"
        onClick={onToggleExpand}
      >
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {supersetExercises.map((ex, idx) => {
              const exerciseName =
                'exercise_name' in ex.exercise
                  ? ex.exercise.exercise_name
                  : ex.exercise.name;
              return (
                <div key={ex.exercise.id} className="flex items-center gap-1">
                  <span className="font-medium text-white">{exerciseName}</span>
                  {getExerciseTypeIcon(ex.exerciseType)}
                  {idx < supersetExercises.length - 1 && (
                    <span className="text-purple-400 font-bold ml-1">+</span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-slate-400 text-sm mt-1">
            {totalSavedSets} / {totalSetsInSuperset} sets complete
          </p>
        </div>
        <div className="flex items-center">
          {allExpanded ? (
            <ChevronUp size={20} className="text-slate-400" />
          ) : (
            <ChevronDown size={20} className="text-slate-400" />
          )}
        </div>
      </button>

      {/* Exercise Notes Buttons */}
      {allExpanded && (
        <div className="mb-4 flex flex-wrap gap-2">
          {supersetExercises.map((ex, localIdx) => {
            const exerciseName =
              'exercise_name' in ex.exercise
                ? ex.exercise.exercise_name
                : ex.exercise.name;
            const currentWeight = ex.sets[0]?.weight || '0';
            const exerciseIndex = exerciseIndices[localIdx];

            return (
              <button
                key={`notes-btn-${ex.exercise.id}`}
                type="button"
                onClick={() =>
                  onOpenNotes(exerciseIndex, exerciseName, currentWeight)
                }
                className="px-2 py-1.5 text-xs bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded text-slate-300 flex items-center gap-1.5 transition-colors"
              >
                <MessageSquare size={12} />
                {exerciseName}
              </button>
            );
          })}
        </div>
      )}

      {/* Rounds */}
      {allExpanded && (
        <div className="space-y-4">
          {Array.from({ length: maxSets }).map((_, roundNumber) => {
            const roundKey = supersetExercises
              .map((ex) => `${ex.exercise.id}-${roundNumber}`)
              .join('-');
            const roundComplete = isRoundComplete(roundNumber);

            return (
              <div
                key={`superset-round-${roundKey}`}
                className={`border rounded-lg p-3 ${
                  roundComplete
                    ? 'border-green-600/50 bg-green-900/10'
                    : 'border-slate-700 bg-slate-800/30'
                }`}
              >
                {/* Round Header */}
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-700/50">
                  <span
                    className={`text-sm font-medium ${
                      roundComplete ? 'text-green-400' : 'text-purple-400'
                    }`}
                  >
                    Round {roundNumber + 1}
                    {roundComplete && ' ✓'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteRound(roundNumber)}
                    className="p-1 text-red-400/70 hover:text-red-400 hover:bg-red-900/30 rounded transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Exercise Rows in Round */}
                <div className="space-y-2">
                  {supersetExercises.map((ex, localIdx) => {
                    const set = ex.sets[roundNumber];
                    if (!set) return null;

                    const exerciseIndex = exerciseIndices[localIdx];
                    const exerciseId = getExerciseId(ex.exercise);
                    const exerciseName =
                      'exercise_name' in ex.exercise
                        ? ex.exercise.exercise_name
                        : ex.exercise.name;
                    const isDuration =
                      ex.exerciseType === 'duration' ||
                      ex.exerciseType === 'duration_weight';
                    const hasWeight =
                      ex.exerciseType === 'reps_weight' ||
                      ex.exerciseType === 'duration_weight';
                    const isSaved = !!set.id;
                    const coaching = coachingMap.get(exerciseId);
                    const setCoaching = coaching?.sets?.[roundNumber];

                    // Target info
                    const targetRepMin =
                      'target_rep_min' in ex.exercise
                        ? ex.exercise.target_rep_min
                        : null;
                    const targetRepMax =
                      'target_rep_max' in ex.exercise
                        ? ex.exercise.target_rep_max
                        : null;
                    const targetDuration =
                      'target_duration_seconds' in ex.exercise
                        ? ex.exercise.target_duration_seconds
                        : null;

                    return (
                      <div
                        key={`${ex.exercise.id}-${roundNumber}`}
                        className={`flex items-center gap-2 py-1.5 px-2 rounded ${
                          isSaved ? 'bg-green-900/20' : 'bg-slate-800/30'
                        }`}
                      >
                        {/* Exercise Name (truncated) */}
                        <span className="w-20 text-xs text-slate-400 truncate">
                          {exerciseName}
                        </span>

                        {/* Weight Input */}
                        {hasWeight && (
                          <div className="flex items-center gap-1">
                            {!isSaved &&
                              getProgressionArrow(setCoaching?.weight)}
                            <Input
                              type="number"
                              value={set.weight}
                              onChange={(e) =>
                                onSetChange(
                                  exerciseIndex,
                                  roundNumber,
                                  'weight',
                                  e.target.value,
                                )
                              }
                              className="w-14 h-7 text-center text-xs p-1"
                              placeholder="lbs"
                            />
                            <span className="text-slate-500 text-xs">lbs</span>
                          </div>
                        )}

                        {/* Separator */}
                        {hasWeight && (
                          <span className="text-slate-600 text-xs">x</span>
                        )}

                        {/* Reps or Duration */}
                        {isDuration ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              value={set.durationSeconds}
                              onChange={(e) =>
                                onSetChange(
                                  exerciseIndex,
                                  roundNumber,
                                  'durationSeconds',
                                  e.target.value,
                                )
                              }
                              className="w-14 h-7 text-center text-xs p-1"
                              placeholder="sec"
                            />
                            <span className="text-slate-500 text-xs">sec</span>
                            {!isSaved && targetDuration && (
                              <span className="text-blue-400 text-xs">
                                ({targetDuration}s)
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            {!isSaved && getProgressionArrow(setCoaching?.reps)}
                            <Input
                              type="number"
                              value={set.reps}
                              onChange={(e) =>
                                onSetChange(
                                  exerciseIndex,
                                  roundNumber,
                                  'reps',
                                  e.target.value,
                                )
                              }
                              className="w-12 h-7 text-center text-xs p-1"
                              placeholder="reps"
                            />
                            {!isSaved && targetRepMin && targetRepMax && (
                              <span className="text-blue-400 text-xs whitespace-nowrap">
                                ({targetRepMin}-{targetRepMax})
                              </span>
                            )}
                          </div>
                        )}

                        {/* Status indicator */}
                        <div className="ml-auto flex items-center gap-1">
                          {isDuration && !isSaved && (
                            <button
                              type="button"
                              onClick={() =>
                                onStartDurationTimer(exerciseIndex, roundNumber)
                              }
                              className="p-1 text-green-400 hover:bg-green-900/30 rounded transition-colors"
                            >
                              <Play size={14} />
                            </button>
                          )}
                          {isSaved && (
                            <Check size={14} className="text-green-400" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Add Round Button */}
          <button
            type="button"
            onClick={onAddRound}
            className="w-full py-2 text-purple-400 text-sm flex items-center justify-center gap-1 hover:text-purple-300 border border-dashed border-slate-700 rounded-lg hover:border-purple-400/50 transition-colors"
          >
            <Plus size={14} />
            Add Round
          </button>
        </div>
      )}
    </>
  );
}
