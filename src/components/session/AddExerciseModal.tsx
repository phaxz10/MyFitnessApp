import { Check, Combine, Search } from 'lucide-react';
import { useState } from 'react';
import type { Exercise } from '../../types';
import { Button, ExerciseMark, Input, Modal } from '../ui';

// Generate unique superset ID
function generateSupersetId(): string {
  return `ss-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

interface AddExerciseModalProps {
  isOpen: boolean;
  onClose: () => void;
  exercises: Exercise[];
  onAddExercise: (exercise: Exercise, supersetId?: string) => Promise<unknown>;
}

export function AddExerciseModal({
  isOpen,
  onClose,
  exercises,
  onAddExercise,
}: AddExerciseModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [supersetSelection, setSupersetSelection] = useState<Exercise[]>([]);

  const close = () => {
    onClose();
    setSearchQuery('');
    setSupersetSelection([]);
  };

  const query = searchQuery.toLowerCase();
  const filteredExercises = exercises.filter(
    (ex) =>
      ex.name.toLowerCase().includes(query) ||
      ex.muscle_groups?.toLowerCase().includes(query),
  );

  const addAsSuperset = async () => {
    const supersetId = generateSupersetId();
    for (const exercise of supersetSelection) {
      await onAddExercise(exercise, supersetId);
    }
    close();
  };

  const selecting = supersetSelection.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title={
        selecting
          ? `Add Superset (${supersetSelection.length} selected)`
          : 'Add Exercise'
      }
    >
      <div className="relative mb-4">
        <Search
          size={18}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3"
          aria-hidden="true"
        />
        <Input
          placeholder="Search exercises..."
          aria-label="Search exercises"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {selecting && (
        <div className="mb-4 space-y-3 rounded-xl bg-sunken p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
              <Combine size={16} className="shrink-0" aria-hidden="true" />
              <span className="truncate">
                {supersetSelection.map((ex) => ex.name).join(' + ')}
              </span>
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSupersetSelection([])}
            >
              Clear
            </Button>
          </div>
          {supersetSelection.length >= 2 ? (
            <Button className="w-full" onClick={addAsSuperset}>
              <Combine size={18} />
              Add as Superset
            </Button>
          ) : (
            <p className="text-center text-sm text-ink-2">
              Select 1 more exercise for superset
            </p>
          )}
        </div>
      )}

      <div className="max-h-[50dvh] divide-y divide-line overflow-y-auto">
        {filteredExercises.map((exercise) => {
          const isSelected = supersetSelection.some(
            (ex) => ex.id === exercise.id,
          );

          return (
            <div key={exercise.id} className="flex items-center gap-1">
              <button
                type="button"
                aria-pressed={selecting ? isSelected : undefined}
                onClick={() => {
                  if (isSelected) {
                    setSupersetSelection((prev) =>
                      prev.filter((ex) => ex.id !== exercise.id),
                    );
                  } else if (selecting) {
                    setSupersetSelection((prev) => [...prev, exercise]);
                  } else {
                    onAddExercise(exercise);
                    onClose();
                    setSearchQuery('');
                  }
                }}
                onContextMenu={(e) => {
                  // Long press / right click starts superset selection
                  e.preventDefault();
                  if (!isSelected) {
                    setSupersetSelection((prev) => [...prev, exercise]);
                  }
                }}
                className={`flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors ${
                  isSelected ? 'bg-train-soft' : 'hover:bg-sunken'
                }`}
              >
                {isSelected ? (
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-train text-on-accent">
                    <Check size={20} />
                  </span>
                ) : (
                  <ExerciseMark
                    name={exercise.name}
                    muscleGroups={exercise.muscle_groups}
                  />
                )}
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">
                    {exercise.name}
                  </span>
                  {exercise.muscle_groups && (
                    <span className="block truncate text-sm text-ink-2">
                      {exercise.muscle_groups}
                    </span>
                  )}
                </span>
              </button>
              {!selecting && (
                <button
                  type="button"
                  onClick={() => setSupersetSelection([exercise])}
                  className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-sunken hover:text-ink"
                  aria-label={`Start superset with ${exercise.name}`}
                  title="Start superset"
                >
                  <Combine size={18} />
                </button>
              )}
            </div>
          );
        })}
        {filteredExercises.length === 0 && (
          <p className="py-6 text-center text-ink-2">
            No exercises found. Try a different name or muscle group.
          </p>
        )}
      </div>

      {!selecting && (
        <p className="mt-3 text-center text-sm text-ink-3">
          Tap <Combine size={14} className="mx-0.5 inline" aria-hidden="true" />{' '}
          to create a superset
        </p>
      )}
    </Modal>
  );
}
