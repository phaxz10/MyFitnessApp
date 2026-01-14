import { ChevronRight, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useExerciseProgress } from '../../hooks/useExerciseProgress';
import type { ExerciseProgressSummary } from '../../types';
import {
  Card,
  CardContent,
  getProgressTrendLabel,
  Input,
  progressTrendToDirection,
  TrendIndicator,
} from '../ui';

interface ExercisesTabProps {
  timeRange: '7d' | '30d' | '90d' | 'all';
  onSelectExercise: (exerciseId: number) => void;
}

export function ExercisesTab({
  timeRange,
  onSelectExercise,
}: ExercisesTabProps) {
  const { getAllExercisesProgress, loading } = useExerciseProgress();
  const [exercises, setExercises] = useState<ExerciseProgressSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMuscle, setFilterMuscle] = useState<string>('all');

  useEffect(() => {
    const fetchData = async () => {
      const data = await getAllExercisesProgress(timeRange);
      setExercises(data);
    };
    fetchData();
  }, [timeRange, getAllExercisesProgress]);

  // Get unique muscle groups for filter
  const muscleGroups = Array.from(
    new Set(
      exercises
        .flatMap((e) => e.muscleGroups.split(',').map((m) => m.trim()))
        .filter((m) => m),
    ),
  ).sort();

  // Filter exercises
  const filteredExercises = exercises.filter((ex) => {
    const matchesSearch = ex.exerciseName
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesMuscle =
      filterMuscle === 'all' ||
      ex.muscleGroups.toLowerCase().includes(filterMuscle.toLowerCase());
    return matchesSearch && matchesMuscle;
  });

  if (loading && exercises.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          size={18}
        />
        <Input
          type="text"
          placeholder="Search exercises..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Muscle Group Filter */}
      {muscleGroups.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
          <button
            type="button"
            onClick={() => setFilterMuscle('all')}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
              filterMuscle === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            All
          </button>
          {muscleGroups.slice(0, 8).map((muscle) => (
            <button
              key={muscle}
              type="button"
              onClick={() => setFilterMuscle(muscle)}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                filterMuscle === muscle
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {muscle}
            </button>
          ))}
        </div>
      )}

      {/* Exercise List */}
      <Card>
        <CardContent className="p-0">
          {filteredExercises.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              {exercises.length === 0
                ? 'No exercises performed yet'
                : 'No exercises match your search'}
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {filteredExercises.map((exercise) => (
                <button
                  key={exercise.exerciseId}
                  type="button"
                  onClick={() => onSelectExercise(exercise.exerciseId)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-700/50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">
                      {exercise.exerciseName}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-slate-400 text-sm">
                        {exercise.totalSessions} sessions
                      </span>
                      {exercise.estimated1RM && (
                        <span className="text-slate-400 text-sm">
                          1RM: {exercise.estimated1RM} lbs
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendIndicator
                      direction={progressTrendToDirection(exercise.trend)}
                      label={getProgressTrendLabel(exercise.trend)}
                    />
                    <ChevronRight className="text-slate-500" size={18} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      {filteredExercises.length > 0 && (
        <p className="text-center text-slate-500 text-sm">
          {filteredExercises.length} of {exercises.length} exercises
        </p>
      )}
    </div>
  );
}
