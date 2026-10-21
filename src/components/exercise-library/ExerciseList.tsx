import { ChevronRight, ListPlus, Plus, Search } from 'lucide-react';
import type { Exercise } from '../../types';
import { Button, ExerciseMark, Input } from '../ui';
import { MUSCLE_GROUPS } from './constants';

interface ExerciseRowProps {
  exercise: Exercise;
  showMuscles: boolean;
  onSelect: (exercise: Exercise) => void;
}

function ExerciseRow({ exercise, showMuscles, onSelect }: ExerciseRowProps) {
  const meta = showMuscles
    ? `${exercise.muscle_groups || 'No muscle groups'} • ${exercise.equipment || 'No equipment'}`
    : exercise.equipment || 'No equipment';
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(exercise)}
        className="flex w-full items-center gap-3 px-3 min-h-14 py-2 text-left hover:bg-sunken transition-colors"
      >
        <ExerciseMark
          name={exercise.name}
          muscleGroups={exercise.muscle_groups}
          size={40}
        />
        <span className="flex-1 min-w-0">
          <span className="block text-ink font-medium truncate">
            {exercise.name}
          </span>
          <span className="block text-ink-3 text-sm truncate">{meta}</span>
        </span>
        <ChevronRight size={18} className="text-ink-3 shrink-0" />
      </button>
    </li>
  );
}

function ExerciseModule({
  exercises,
  showMuscles,
  onSelect,
}: {
  exercises: Exercise[];
  showMuscles: boolean;
  onSelect: (exercise: Exercise) => void;
}) {
  return (
    <ul className="bg-surface border border-line rounded-xl divide-y divide-line overflow-hidden">
      {exercises.map((exercise) => (
        <ExerciseRow
          key={exercise.id}
          exercise={exercise}
          showMuscles={showMuscles}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

interface ExerciseListProps {
  filteredExercises: Exercise[];
  groupedExercises: Record<string, Exercise[]>;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedMuscle: string;
  onMuscleChange: (muscle: string) => void;
  onAdd: () => void;
  onBatchAdd: () => void;
  onSelect: (exercise: Exercise) => void;
}

export function ExerciseList({
  filteredExercises,
  groupedExercises,
  searchQuery,
  onSearchChange,
  selectedMuscle,
  onMuscleChange,
  onAdd,
  onBatchAdd,
  onSelect,
}: ExerciseListProps) {
  const unfiltered = selectedMuscle === 'All' && !searchQuery;
  return (
    <>
      {/* Sticky search + filter chips, below the discipline band */}
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 -mx-4 px-4 pt-4 pb-2 bg-canvas space-y-3">
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <Input
            placeholder="Search exercises..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {MUSCLE_GROUPS.map((muscle) => (
            <button
              type="button"
              key={muscle}
              onClick={() => onMuscleChange(muscle)}
              className={`px-4 h-10 shrink-0 rounded-full text-sm whitespace-nowrap transition-colors ${
                selectedMuscle === muscle
                  ? 'bg-train text-on-accent'
                  : 'bg-sunken text-ink-2 hover:bg-sunken-strong'
              }`}
            >
              {muscle}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          className="flex-1 whitespace-nowrap px-3"
          size="lg"
          onClick={onAdd}
        >
          <Plus size={18} aria-hidden="true" />
          Add
        </Button>
        <Button
          variant="secondary"
          className="flex-1 whitespace-nowrap px-3"
          size="lg"
          onClick={onBatchAdd}
        >
          <ListPlus size={18} aria-hidden="true" />
          Batch add
        </Button>
      </div>

      {filteredExercises.length === 0 ? (
        <div className="bg-surface border border-line rounded-xl p-6 text-center">
          <p className="text-ink-2 mb-4">
            {unfiltered
              ? 'No exercises in your library yet'
              : 'No exercises found matching your search'}
          </p>
          {unfiltered && (
            <Button onClick={onAdd}>Add Your First Exercise</Button>
          )}
        </div>
      ) : unfiltered ? (
        <div className="space-y-4">
          {Object.entries(groupedExercises).map(([group, exs]) => (
            <section key={group} className="space-y-2">
              <h2 className="text-sm font-semibold text-ink-2">{group}</h2>
              <ExerciseModule
                exercises={exs}
                showMuscles={false}
                onSelect={onSelect}
              />
            </section>
          ))}
        </div>
      ) : (
        <ExerciseModule
          exercises={filteredExercises}
          showMuscles
          onSelect={onSelect}
        />
      )}
    </>
  );
}
