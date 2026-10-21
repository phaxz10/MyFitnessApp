import { ChevronRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  type TimeRange,
  useAllExercisesProgress,
} from '../../hooks/useStrengthProgress';
import {
  Card,
  ExerciseMark,
  getProgressTrendLabel,
  Input,
  progressTrendToDirection,
  Skeleton,
  TrendIndicator,
} from '../ui';
import { formatSessionCount } from './format';

interface ExercisesTabProps {
  timeRange: TimeRange;
  onSelectExercise: (exerciseId: number) => void;
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-11 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors ${
        active
          ? 'bg-train text-on-accent'
          : 'bg-sunken text-ink-2 hover:bg-sunken-strong'
      }`}
    >
      {children}
    </button>
  );
}

export function ExercisesTab({
  timeRange,
  onSelectExercise,
}: ExercisesTabProps) {
  const { data: exercises = [], isLoading } =
    useAllExercisesProgress(timeRange);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMuscle, setFilterMuscle] = useState<string>('all');

  const muscleGroups = useMemo(() => {
    return Array.from(
      new Set(
        exercises
          .flatMap((e) => e.muscleGroups.split(',').map((m) => m.trim()))
          .filter((m) => m),
      ),
    ).sort();
  }, [exercises]);

  const filteredExercises = useMemo(() => {
    return exercises.filter((ex) => {
      const matchesSearch = ex.exerciseName
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesMuscle =
        filterMuscle === 'all' ||
        ex.muscleGroups.toLowerCase().includes(filterMuscle.toLowerCase());
      return matchesSearch && matchesMuscle;
    });
  }, [exercises, searchQuery, filterMuscle]);

  // Show loading only on initial load, not when data exists
  if (isLoading && exercises.length === 0) {
    return (
      <Card className="divide-y divide-line">
        {['a', 'b', 'c', 'd'].map((id) => (
          <div key={id} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
          size={18}
        />
        <Input
          type="text"
          placeholder="Search exercises"
          aria-label="Search exercises"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {muscleGroups.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
          <FilterChip
            active={filterMuscle === 'all'}
            onClick={() => setFilterMuscle('all')}
          >
            All
          </FilterChip>
          {muscleGroups.slice(0, 8).map((muscle) => (
            <FilterChip
              key={muscle}
              active={filterMuscle === muscle}
              onClick={() => setFilterMuscle(muscle)}
            >
              {muscle}
            </FilterChip>
          ))}
        </div>
      )}

      <Card>
        {filteredExercises.length === 0 ? (
          <p className="p-8 text-center text-ink-3">
            {exercises.length === 0
              ? 'No exercises performed in this range. Log a workout to see them here.'
              : 'No exercises match your search.'}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {filteredExercises.map((exercise) => (
              <li key={exercise.exerciseId}>
                <button
                  type="button"
                  onClick={() => onSelectExercise(exercise.exerciseId)}
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sunken"
                >
                  <ExerciseMark
                    name={exercise.exerciseName}
                    muscleGroups={exercise.muscleGroups}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">
                      {exercise.exerciseName}
                    </p>
                    <p className="num text-sm text-ink-3">
                      {formatSessionCount(exercise.totalSessions)}
                      {exercise.estimated1RM
                        ? ` · 1RM ${exercise.estimated1RM} lbs`
                        : ''}
                    </p>
                  </div>
                  <TrendIndicator
                    direction={progressTrendToDirection(exercise.trend)}
                    label={getProgressTrendLabel(exercise.trend)}
                  />
                  <ChevronRight className="shrink-0 text-ink-3" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {filteredExercises.length > 0 && (
        <p className="num text-center text-sm text-ink-3">
          {filteredExercises.length} of {exercises.length} exercises
        </p>
      )}
    </div>
  );
}
