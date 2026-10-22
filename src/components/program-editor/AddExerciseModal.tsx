import { Plus } from 'lucide-react';
import { useState } from 'react';
import { normalizeExerciseName } from '../../services/writers/exerciseResolver';
import type { Exercise } from '../../types';
import { Button, ExerciseMark, Input, Modal } from '../ui';
import { EXERCISE_TYPE_LABELS } from './schema';

interface AddExerciseModalProps {
  isOpen: boolean;
  exercises: Exercise[];
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
  /** Add a new library exercise by name (AI details when available). */
  onCreate: (name: string) => Promise<void>;
  onManageLibrary: () => void;
}

export function AddExerciseModal({
  isOpen,
  exercises,
  onClose,
  onPick,
  onCreate,
  onManageLibrary,
}: AddExerciseModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const close = () => {
    if (isCreating) return;
    onClose();
    setSearchQuery('');
    setCreateError(null);
  };

  const query = searchQuery.trim().replace(/\s+/g, ' ');
  const canCreate =
    query !== '' &&
    !exercises.some(
      (ex) => normalizeExerciseName(ex.name) === normalizeExerciseName(query),
    );

  const handleCreate = async () => {
    setIsCreating(true);
    setCreateError(null);
    try {
      await onCreate(query);
      setSearchQuery('');
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : 'Could not add the exercise.',
      );
    } finally {
      setIsCreating(false);
    }
  };

  const q = searchQuery.toLowerCase();
  const filteredExercises = exercises.filter(
    (ex) =>
      ex.name.toLowerCase().includes(q) ||
      ex.muscle_groups?.toLowerCase().includes(q),
  );

  return (
    <Modal isOpen={isOpen} onClose={close} title="Add exercise">
      <Input
        type="search"
        aria-label="Search exercises"
        placeholder="Search exercises..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <div className="mt-3 -mx-4 max-h-[50vh] overflow-y-auto">
        {canCreate && (
          <button
            type="button"
            onClick={handleCreate}
            disabled={isCreating}
            aria-busy={isCreating || undefined}
            className="w-full flex items-center gap-3 px-4 py-2.5 min-h-14 text-left border-t border-line hover:bg-sunken transition-colors disabled:opacity-45"
          >
            <ExerciseMark name={query} size={40} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-ink truncate">
                Create “{query}”
              </p>
              <p className="text-sm text-ink-3 truncate">
                {isCreating
                  ? 'Adding to your library...'
                  : 'Add to your library'}
              </p>
            </div>
            <Plus
              size={20}
              className="shrink-0 text-ink-2"
              aria-hidden="true"
            />
          </button>
        )}
        {createError && (
          <p role="alert" className="px-4 py-2 text-sm text-danger">
            {createError}
          </p>
        )}
        {exercises.length === 0 ? (
          !canCreate && (
            <p className="text-ink-2 text-center px-4 py-6">
              Your library is empty. Type any exercise name to add it.
            </p>
          )
        ) : filteredExercises.length === 0 ? (
          !canCreate && (
            <p className="text-ink-2 text-center px-4 py-6">
              No exercises found.
            </p>
          )
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {filteredExercises.map((exercise) => {
              const typeInfo =
                EXERCISE_TYPE_LABELS[exercise.exercise_type || 'reps_weight'];
              return (
                <li key={exercise.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(exercise);
                      setSearchQuery('');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 min-h-14 text-left hover:bg-sunken transition-colors"
                  >
                    <ExerciseMark
                      name={exercise.name}
                      muscleGroups={exercise.muscle_groups}
                      size={40}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-ink truncate">
                        {exercise.name}
                      </p>
                      <p className="text-sm text-ink-3 truncate">
                        {exercise.muscle_groups && (
                          <span className="text-ink-2">
                            {exercise.muscle_groups}
                          </span>
                        )}
                        {exercise.muscle_groups && ' · '}
                        {typeInfo?.label}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Button
        variant="secondary"
        className="w-full mt-4"
        onClick={onManageLibrary}
      >
        Manage Exercise Library
      </Button>
    </Modal>
  );
}
