import {
  ChevronDown,
  Combine,
  Loader2,
  PencilLine,
  Plus,
  SquarePen,
  Trash2,
  Unlink,
} from 'lucide-react';
import { useState } from 'react';
import type { ExerciseWithSets } from '../../hooks/useWorkoutSession';
import type { AIExerciseCoachingResponse } from '../../types';
import { getProgressionArrow } from '../../utils/workoutHelpers';
import { Button, ExerciseMark } from '../ui';
import {
  CoachingTip,
  DoneButton,
  exerciseKind,
  NumberCell,
  type SetField,
  StartHoldButton,
  ToolButton,
} from './SetCells';

interface SupersetCardProps {
  supersetExercises: ExerciseWithSets[];
  exerciseIndices: number[];
  coachingMap: Map<number, AIExerciseCoachingResponse>;
  isLoading: (key: string) => boolean;
  onToggleExpand: () => void;
  onSetChange: (
    exerciseIndex: number,
    setIndex: number,
    field: SetField,
    value: string,
  ) => void;
  onCompleteRound: (roundNumber: number) => void;
  onUncompleteRound: (roundNumber: number) => void;
  onDeleteRound: (roundNumber: number) => void;
  onAddRound: () => void;
  onStartDurationTimer: (exerciseIndex: number, setIndex: number) => void;
  onOpenNotes: (
    exerciseIndex: number,
    exerciseName: string,
    currentWeight: string,
  ) => void;
  onExerciseNameClick?: (exerciseId: number, exerciseName: string) => void;
  onBreakSuperset?: () => void;
  getExerciseId: (ex: ExerciseWithSets) => number;
}

// Fixed columns inside a round: exercise / weight / reps (or sec) / status.
const ROUND_GRID =
  'grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_3rem] items-center gap-2';

export function SupersetCard({
  supersetExercises,
  exerciseIndices,
  coachingMap,
  isLoading,
  onToggleExpand,
  onSetChange,
  onCompleteRound,
  onUncompleteRound,
  onDeleteRound,
  onAddRound,
  onStartDurationTimer,
  onOpenNotes,
  onExerciseNameClick,
  onBreakSuperset,
  getExerciseId,
}: SupersetCardProps) {
  const [editing, setEditing] = useState(false);
  const maxSets = Math.max(...supersetExercises.map((ex) => ex.sets.length));
  const allExpanded = supersetExercises.every((ex) => ex.isExpanded);
  const firstIndex = exerciseIndices[0];

  const isRoundComplete = (roundNumber: number): boolean =>
    supersetExercises.every((ex) => ex.sets[roundNumber]?.completed);

  const rounds = Array.from({ length: maxSets }, (_, i) => isRoundComplete(i));
  const roundsDone = rounds.filter(Boolean).length;
  const nextRound = rounds.indexOf(false);
  const anyDuration = supersetExercises.some(
    (ex) => exerciseKind(ex.exerciseType).isDuration,
  );
  const anyWeight = supersetExercises.some(
    (ex) => exerciseKind(ex.exerciseType).hasWeight,
  );
  const isAddingRound = isLoading(`addRound:${firstIndex}`);
  const isDeletingRound = isLoading(`deleteRound:${firstIndex}`);

  return (
    <>
      {/* Superset header */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-2">
            <Combine size={16} aria-hidden="true" />
            Superset
          </p>
          {supersetExercises.map((ex) => (
            <div key={ex.exercise.id} className="flex items-center gap-3">
              <ExerciseMark
                name={ex.exercise.name}
                muscleGroups={ex.exercise.muscle_groups}
                size={36}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onExerciseNameClick?.(getExerciseId(ex), ex.exercise.name);
                }}
                className="min-h-11 min-w-0 truncate py-2.5 text-left text-base leading-6 font-bold text-ink hover:text-train-ink"
              >
                {ex.exercise.name}
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={allExpanded}
          aria-label={allExpanded ? 'Collapse rounds' : 'Show rounds'}
          className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-sunken"
        >
          <ChevronDown
            size={22}
            className={`transition-transform ${allExpanded ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Round progress */}
      <div className="mt-3 flex items-center gap-3">
        <p className="shrink-0 text-sm text-ink-2">
          Round{' '}
          <span className="num text-xl font-bold text-ink">
            {nextRound === -1 ? roundsDone : nextRound + 1}
          </span>
          <span className="num text-ink-3"> of {maxSets}</span>
        </p>
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {rounds.map((done, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: round position is the identity
              key={i}
              className={`h-2 flex-1 rounded-full ${
                done
                  ? 'bg-train'
                  : i === nextRound
                    ? 'bg-train-soft'
                    : 'bg-sunken-strong'
              }`}
            />
          ))}
        </div>
      </div>

      {allExpanded && (
        <div className="mt-4 space-y-3">
          {supersetExercises.map((ex) => {
            const tip = coachingMap.get(getExerciseId(ex))?.coachingTip;
            if (!tip) return null;
            return (
              <CoachingTip key={`coaching-${ex.exercise.id}`}>
                <span className="font-semibold text-ink">
                  {ex.exercise.name}:
                </span>{' '}
                {tip}
              </CoachingTip>
            );
          })}

          {/* Column heads */}
          <div className={`${ROUND_GRID} px-2 text-xs font-medium text-ink-3`}>
            <span>Exercise</span>
            <span className="text-center">{anyWeight ? 'lbs' : ''}</span>
            <span className="text-center">
              {anyDuration ? 'Reps/sec' : 'Reps'}
            </span>
            <span className="text-center">Done</span>
          </div>

          <div className="space-y-2">
            {rounds.map((roundComplete, roundNumber) => {
              const roundKey = supersetExercises
                .map((ex) => `${ex.exercise.id}-${roundNumber}`)
                .join('-');
              const isNext = roundNumber === nextRound;
              const completing = isLoading(
                `completeRound:${firstIndex}:${roundNumber}`,
              );

              return (
                <div
                  key={`superset-round-${roundKey}`}
                  className={`rounded-xl px-2 py-2 transition-colors ${
                    roundComplete ? 'bg-train-soft' : isNext ? 'bg-sunken' : ''
                  }`}
                >
                  {/* Round header: label + round done in the done column */}
                  <div className={ROUND_GRID}>
                    <div className="col-span-3 flex items-center gap-2">
                      {editing && !roundComplete && (
                        <button
                          type="button"
                          onClick={() => onDeleteRound(roundNumber)}
                          disabled={isDeletingRound}
                          aria-label={`Delete round ${roundNumber + 1}`}
                          className="grid size-11 place-items-center rounded-lg text-danger hover:bg-danger-soft disabled:opacity-50"
                        >
                          {isDeletingRound ? (
                            <Loader2 size={18} className="animate-spin" />
                          ) : (
                            <Trash2 size={18} />
                          )}
                        </button>
                      )}
                      <span
                        className={`text-base font-bold ${
                          roundComplete || isNext
                            ? 'text-train-ink'
                            : 'text-ink'
                        }`}
                      >
                        Round <span className="num">{roundNumber + 1}</span>
                      </span>
                      {isNext && (
                        <span className="rounded-full bg-train px-2 py-0.5 text-xs font-semibold text-on-accent">
                          Next
                        </span>
                      )}
                    </div>
                    <DoneButton
                      completed={roundComplete}
                      isNext={isNext}
                      loading={completing}
                      label={`round ${roundNumber + 1}`}
                      onComplete={() => onCompleteRound(roundNumber)}
                      onUncomplete={() => onUncompleteRound(roundNumber)}
                    />
                  </div>

                  <div className="mt-1 space-y-1">
                    {supersetExercises.map((ex, localIdx) => {
                      const set = ex.sets[roundNumber];
                      if (!set) return null;
                      return (
                        <RoundRow
                          // biome-ignore lint/suspicious/noArrayIndexKey: roundNumber is the stable round position, unique together with exercise.id
                          key={`${ex.exercise.id}-${roundNumber}`}
                          ex={ex}
                          roundNumber={roundNumber}
                          exerciseIndex={exerciseIndices[localIdx]}
                          coaching={coachingMap.get(getExerciseId(ex))}
                          onSetChange={onSetChange}
                          onStartDurationTimer={onStartDurationTimer}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <Button
            variant="secondary"
            className="w-full"
            onClick={onAddRound}
            isLoading={isAddingRound}
          >
            {!isAddingRound && <Plus size={18} />}
            {isAddingRound ? 'Adding...' : 'Add Round'}
          </Button>

          {/* Superset tools */}
          <div className="-mx-1 flex flex-wrap items-center gap-1 border-t border-line pt-2">
            {supersetExercises.map((ex, localIdx) => (
              <ToolButton
                key={`notes-btn-${ex.exercise.id}`}
                onClick={() =>
                  onOpenNotes(
                    exerciseIndices[localIdx],
                    ex.exercise.name,
                    ex.sets[0]?.weight || '0',
                  )
                }
                icon={<PencilLine size={16} />}
              >
                <span className="max-w-32 truncate">{ex.exercise.name}</span>
              </ToolButton>
            ))}
            <ToolButton
              onClick={() => setEditing((v) => !v)}
              pressed={editing}
              icon={<SquarePen size={16} />}
            >
              {editing ? 'Done editing' : 'Edit rounds'}
            </ToolButton>
            {onBreakSuperset && (
              <span className="ml-auto">
                <ToolButton
                  onClick={onBreakSuperset}
                  tone="danger"
                  icon={<Unlink size={16} />}
                >
                  Break Superset
                </ToolButton>
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}

interface RoundRowProps {
  ex: ExerciseWithSets;
  roundNumber: number;
  exerciseIndex: number;
  coaching?: AIExerciseCoachingResponse;
  onSetChange: SupersetCardProps['onSetChange'];
  onStartDurationTimer: SupersetCardProps['onStartDurationTimer'];
}

function RoundRow({
  ex,
  roundNumber,
  exerciseIndex,
  coaching,
  onSetChange,
  onStartDurationTimer,
}: RoundRowProps) {
  const set = ex.sets[roundNumber];
  const { isDuration, hasWeight } = exerciseKind(ex.exerciseType);
  const isCompleted = set.completed;
  const setCoaching = coaching?.sets?.[roundNumber];
  const name = ex.exercise.name;
  const change = (field: SetField) => (value: string) =>
    onSetChange(exerciseIndex, roundNumber, field, value);

  return (
    <div className={ROUND_GRID}>
      <span className="truncate text-sm text-ink-2">{name}</span>

      {hasWeight ? (
        <NumberCell
          size="md"
          label={`${name} weight, lbs`}
          value={set.weight}
          placeholder={set.placeholderWeight || '0'}
          disabled={isCompleted}
          onChange={change('weight')}
          hint={!isCompleted && getProgressionArrow(setCoaching?.weight)}
        />
      ) : (
        <span className="text-center text-sm text-ink-3">—</span>
      )}

      {isDuration ? (
        <NumberCell
          size="md"
          label={`${name} seconds`}
          value={set.durationSeconds}
          placeholder={set.placeholderDuration || '0'}
          disabled={isCompleted}
          onChange={change('durationSeconds')}
        />
      ) : (
        <NumberCell
          size="md"
          label={`${name} reps`}
          value={set.reps}
          placeholder={set.placeholderReps || '0'}
          disabled={isCompleted}
          onChange={change('reps')}
          hint={!isCompleted && getProgressionArrow(setCoaching?.reps)}
        />
      )}

      {isDuration && !isCompleted ? (
        <StartHoldButton
          label={name}
          onClick={() => onStartDurationTimer(exerciseIndex, roundNumber)}
        />
      ) : (
        <span aria-hidden="true" />
      )}
    </div>
  );
}
