import type { useWorkoutSession } from '../../hooks/useWorkoutSession';
import type { AIExerciseCoachingResponse } from '../../types';
import { Card } from '../ui';
import { ExerciseCard, SupersetCard } from '../workout';

type Session = ReturnType<typeof useWorkoutSession>;

interface SessionExerciseListProps {
  session: Pick<
    Session,
    | 'exercisesWithSets'
    | 'groupedExercises'
    | 'isLoading'
    | 'handleSetChange'
    | 'handleUncompleteSet'
    | 'handleAddSet'
    | 'handleAddSetToSuperset'
    | 'handleDeleteSet'
    | 'handleDeleteRound'
    | 'handleRemoveExercise'
    | 'handleLinkExercisesAsSuperset'
    | 'handleBreakSuperset'
    | 'toggleExerciseExpand'
    | 'getExerciseId'
  >;
  coachingMap: Map<number, AIExerciseCoachingResponse>;
  /** Exercise index picked as the first half of a new superset. */
  linkSelection: number | null;
  onLinkSelectionChange: (index: number | null) => void;
  onCompleteSet: (exerciseIndex: number, setIndex: number) => void;
  onCompleteRound: (exerciseIndices: number[], roundNumber: number) => void;
  onUncompleteRound: (exerciseIndices: number[], roundNumber: number) => void;
  onStartDurationTimer: (exerciseIndex: number, setIndex: number) => void;
  onOpenNotes: (
    exerciseId: number,
    exerciseName: string,
    currentWeight: string,
  ) => void;
  onOpenInfo: (exerciseId: number, exerciseName: string) => void;
}

// The session's exercise blocks: single exercises and supersets, in order.
export function SessionExerciseList({
  session,
  coachingMap,
  linkSelection,
  onLinkSelectionChange,
  onCompleteSet,
  onCompleteRound,
  onUncompleteRound,
  onStartDurationTimer,
  onOpenNotes,
  onOpenInfo,
}: SessionExerciseListProps) {
  const {
    exercisesWithSets,
    groupedExercises,
    isLoading,
    handleSetChange,
    handleUncompleteSet,
    handleAddSet,
    handleAddSetToSuperset,
    handleDeleteSet,
    handleDeleteRound,
    handleRemoveExercise,
    handleLinkExercisesAsSuperset,
    handleBreakSuperset,
    toggleExerciseExpand,
    getExerciseId,
  } = session;

  // The first block with an open set is "current": it gets the blue rule.
  const isGroupOpen = (item: (typeof groupedExercises)[number]) =>
    (Array.isArray(item) ? item : [item]).some((ex) =>
      ex.sets.some((s) => !s.completed),
    );
  const currentGroup = groupedExercises.find(isGroupOpen);

  return (
    <>
      {groupedExercises.map((item) => {
        const isCurrent = item === currentGroup;

        if (Array.isArray(item)) {
          const exerciseIndices = item.map((ex) =>
            exercisesWithSets.indexOf(ex),
          );
          const supersetKey = item.map((ex) => ex.exercise.id).join('-');
          const supersetGroupId = item[0]?.workoutLogExercise.superset_group_id;

          return (
            <Card
              key={`superset-${supersetKey}`}
              className={`p-3 ${isCurrent ? 'border-train' : ''}`}
            >
              <SupersetCard
                supersetExercises={item}
                exerciseIndices={exerciseIndices}
                coachingMap={coachingMap}
                isLoading={isLoading}
                onToggleExpand={() => {
                  for (const ex of item) {
                    toggleExerciseExpand(exercisesWithSets.indexOf(ex));
                  }
                }}
                onSetChange={handleSetChange}
                onCompleteRound={(roundNumber) =>
                  onCompleteRound(exerciseIndices, roundNumber)
                }
                onUncompleteRound={(roundNumber) =>
                  onUncompleteRound(exerciseIndices, roundNumber)
                }
                onDeleteRound={(roundNumber) =>
                  handleDeleteRound(exerciseIndices, roundNumber)
                }
                onAddRound={() => handleAddSetToSuperset(exerciseIndices)}
                onStartDurationTimer={onStartDurationTimer}
                onOpenNotes={(exerciseIndex, exerciseName, currentWeight) =>
                  onOpenNotes(
                    getExerciseId(exercisesWithSets[exerciseIndex]),
                    exerciseName,
                    currentWeight,
                  )
                }
                onExerciseNameClick={onOpenInfo}
                onBreakSuperset={
                  supersetGroupId
                    ? () => handleBreakSuperset(supersetGroupId)
                    : undefined
                }
                getExerciseId={getExerciseId}
              />
            </Card>
          );
        }

        const exerciseIndex = exercisesWithSets.indexOf(item);
        const exerciseId = getExerciseId(item);
        const isInSuperset = !!item.workoutLogExercise.superset_group_id;
        const isSelectedForLink = linkSelection === exerciseIndex;

        return (
          <Card
            key={`exercise-${item.exercise.id}`}
            className={`p-3 ${
              isSelectedForLink
                ? 'border-line-strong bg-sunken'
                : isCurrent
                  ? 'border-train'
                  : ''
            }`}
          >
            <ExerciseCard
              exerciseData={item}
              exerciseIndex={exerciseIndex}
              coaching={coachingMap.get(exerciseId)}
              isSelectedForLink={isSelectedForLink}
              isLoading={isLoading}
              onToggleExpand={() => toggleExerciseExpand(exerciseIndex)}
              onSetChange={(setIndex, field, value) =>
                handleSetChange(exerciseIndex, setIndex, field, value)
              }
              onCompleteSet={(setIndex) =>
                onCompleteSet(exerciseIndex, setIndex)
              }
              onUncompleteSet={(setIndex) =>
                handleUncompleteSet(exerciseIndex, setIndex)
              }
              onDeleteSet={(setIndex) =>
                handleDeleteSet(exerciseIndex, setIndex)
              }
              onAddSet={() => handleAddSet(exerciseIndex)}
              onStartDurationTimer={(setIndex) =>
                onStartDurationTimer(exerciseIndex, setIndex)
              }
              onOpenNotes={() =>
                onOpenNotes(
                  exerciseId,
                  item.exercise.name,
                  item.sets[0]?.weight || '0',
                )
              }
              onExerciseNameClick={() =>
                onOpenInfo(exerciseId, item.exercise.name)
              }
              onRemoveExercise={() => handleRemoveExercise(exerciseIndex)}
              onLinkExercise={
                !isInSuperset
                  ? () => {
                      if (linkSelection === null) {
                        // First selection - mark this exercise
                        onLinkSelectionChange(exerciseIndex);
                      } else if (linkSelection === exerciseIndex) {
                        // Same exercise again - deselect
                        onLinkSelectionChange(null);
                      } else {
                        // Second selection - create superset
                        handleLinkExercisesAsSuperset([
                          linkSelection,
                          exerciseIndex,
                        ]);
                        onLinkSelectionChange(null);
                      }
                    }
                  : undefined
              }
            />
          </Card>
        );
      })}
    </>
  );
}
