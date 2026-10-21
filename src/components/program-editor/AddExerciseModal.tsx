import { useState } from 'react';
import type { Exercise } from '../../types';
import { Button, ExerciseMark, Input, Modal } from '../ui';
import { EXERCISE_TYPE_LABELS } from './schema';

interface AddExerciseModalProps {
  isOpen: boolean;
  exercises: Exercise[];
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
  onManageLibrary: () => void;
}

export function AddExerciseModal({
  isOpen,
  exercises,
  onClose,
  onPick,
  onManageLibrary,
}: AddExerciseModalProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const close = () => {
    onClose();
    setSearchQuery('');
  };

  const q = searchQuery.toLowerCase();
  const filteredExercises = exercises.filter(
    (ex) =>
      ex.name.toLowerCase().includes(q) ||
      ex.muscle_groups?.toLowerCase().includes(q),
  );

  return (
    <Modal isOpen={isOpen} onClose={close} title="Add Exercise">
      <Input
        type="search"
        aria-label="Search exercises"
        placeholder="Search exercises..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <div className="mt-3 -mx-4 max-h-[50vh] overflow-y-auto">
        {filteredExercises.length === 0 ? (
          <p className="text-ink-2 text-center px-4 py-6">
            No exercises found. Add some in the Exercise Library.
          </p>
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
