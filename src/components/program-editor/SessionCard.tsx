import {
  ChevronDown,
  ChevronUp,
  Link2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { UseFormRegister } from 'react-hook-form';
import { Button, Card, Input, Select } from '../ui';
import { ExerciseRow } from './ExerciseRow';
import { NumberInput } from './NumberInput';
import {
  DAY_OPTIONS,
  getExerciseGroups,
  type ProgramFormData,
  type SessionFormData,
  type SupersetSelection,
} from './schema';

interface SessionCardProps {
  session: SessionFormData | undefined;
  sessionIndex: number;
  sessionFieldId: string;
  register: UseFormRegister<ProgramFormData>;
  selectedForSuperset: SupersetSelection | null;
  muscleGroupsById: Map<number, string>;
  onToggleExpand: () => void;
  onRemove: () => void;
  onAddExercise: () => void;
  onFillWithAI: () => void;
  onDeleteExercise: (exerciseIndex: number) => void;
  onSupersetTap: (exerciseIndex: number) => void;
  onBreakSuperset: (supersetGroupId: string) => void;
  onSupersetSetsChange: (supersetGroupId: string, sets: number) => void;
}

export function SessionCard({
  session,
  sessionIndex,
  sessionFieldId,
  register,
  selectedForSuperset,
  muscleGroupsById,
  onToggleExpand,
  onRemove,
  onAddExercise,
  onFillWithAI,
  onDeleteExercise,
  onSupersetTap,
  onBreakSuperset,
  onSupersetSetsChange,
}: SessionCardProps) {
  const exerciseGroups = session ? getExerciseGroups(session.exercises) : [];
  const exerciseCount = session?.exercises.length ?? 0;

  const renderRow = (
    exercise: SessionFormData['exercises'][number],
    index: number,
    isInSuperset: boolean,
  ) => (
    <ExerciseRow
      key={exercise.id ?? `${sessionFieldId}-ex-${index}`}
      exercise={exercise}
      exerciseIndex={index}
      sessionIndex={sessionIndex}
      muscleGroups={muscleGroupsById.get(exercise.exerciseId)}
      register={register}
      isInSuperset={isInSuperset}
      canJoinSuperset={
        isInSuperset &&
        selectedForSuperset?.sessionIndex === sessionIndex &&
        selectedForSuperset.exerciseIndex !== index
      }
      isSelectedForSuperset={
        selectedForSuperset?.sessionIndex === sessionIndex &&
        selectedForSuperset?.exerciseIndex === index
      }
      onSupersetTap={() => onSupersetTap(index)}
      onDelete={() => onDeleteExercise(index)}
    />
  );

  return (
    <Card>
      {/* Session header */}
      <div className="p-4 space-y-2">
        <Input
          {...register(`sessions.${sessionIndex}.name`)}
          aria-label="Session name"
          placeholder="Session name"
          className="font-semibold"
        />
        <div className="flex items-center gap-1">
          <div className="flex-1">
            <Select
              {...register(`sessions.${sessionIndex}.dayOfWeek`)}
              aria-label="Day of week"
              options={DAY_OPTIONS}
            />
          </div>
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={!!session?.isExpanded}
            aria-label={
              session?.isExpanded ? 'Collapse session' : 'Expand session'
            }
            className="grid place-items-center size-11 rounded-lg text-ink-2 hover:text-ink hover:bg-sunken"
          >
            {session?.isExpanded ? (
              <ChevronUp size={20} />
            ) : (
              <ChevronDown size={20} />
            )}
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove session"
            className="grid place-items-center size-11 rounded-lg text-ink-2 hover:text-danger hover:bg-sunken"
          >
            <Trash2 size={20} />
          </button>
        </div>
        {!session?.isExpanded && (
          <p className="text-sm text-ink-3">
            <span className="num">{exerciseCount}</span> exercises
          </p>
        )}
      </div>

      {session?.isExpanded && (
        <div className="border-t border-line">
          {exerciseGroups.length === 0 ? (
            <p className="px-4 py-3 text-ink-2 text-sm">No exercises added</p>
          ) : (
            <ul className="divide-y divide-line">
              {exerciseGroups.map((group) =>
                group.supersetId ? (
                  <li key={group.supersetId} className="bg-sunken">
                    {/* Superset header: shared sets and break button */}
                    <div className="flex items-center gap-2 pl-4 pr-1 py-1">
                      <Link2
                        size={16}
                        className="text-ink-2"
                        aria-hidden="true"
                      />
                      <span className="flex-1 text-sm font-semibold text-ink-2">
                        Superset
                      </span>
                      <div className="flex items-center gap-2 text-sm text-ink-2">
                        <label htmlFor={`${group.supersetId}-sets`}>Sets</label>
                        <NumberInput
                          id={`${group.supersetId}-sets`}
                          value={group.exercises[0]?.exercise.targetSets || 3}
                          onChange={(e) =>
                            onSupersetSetsChange(
                              group.supersetId!,
                              parseInt(e.target.value, 10) || 1,
                            )
                          }
                          min={1}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => onBreakSuperset(group.supersetId!)}
                        aria-label="Break superset"
                        title="Break superset"
                        className="grid place-items-center size-11 rounded-lg text-ink-2 hover:text-danger hover:bg-sunken-strong transition-colors"
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <ul className="ml-4 divide-y divide-line border-t border-l border-line-strong bg-surface">
                      {group.exercises.map(({ exercise, index }) =>
                        renderRow(exercise, index, true),
                      )}
                    </ul>
                  </li>
                ) : (
                  group.exercises.map(({ exercise, index }) =>
                    renderRow(exercise, index, false),
                  )
                ),
              )}
            </ul>
          )}

          <div className="flex gap-2 p-3 border-t border-line">
            <Button
              type="button"
              variant="secondary"
              className="flex-1 whitespace-nowrap"
              onClick={onAddExercise}
            >
              <Plus size={18} aria-hidden="true" />
              Add exercise
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="flex-1 whitespace-nowrap"
              onClick={onFillWithAI}
            >
              <Sparkles size={18} aria-hidden="true" />
              Fill with AI
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
