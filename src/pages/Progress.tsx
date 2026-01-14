import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ExerciseProgressDetail,
  ExercisesTab,
  OverviewTab,
} from '../components/progress';
import {
  Button,
  ProgressSkeleton,
  type TimeRange,
  TimeRangeSelector,
} from '../components/ui';
import { useExerciseProgress } from '../hooks/useExerciseProgress';
import type { ExerciseProgressSummary } from '../types';

type Tab = 'overview' | 'exercises';

export function Progress() {
  const navigate = useNavigate();
  const { getAllExercisesProgress } = useExerciseProgress();

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(
    null,
  );
  const [selectedExerciseName, setSelectedExerciseName] = useState<string>('');

  // Fetch exercises for name lookup
  const [exercises, setExercises] = useState<ExerciseProgressSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchExercises = async () => {
      setIsLoading(true);
      try {
        const data = await getAllExercisesProgress(timeRange);
        setExercises(data);
      } finally {
        setIsLoading(false);
      }
    };
    fetchExercises();
  }, [timeRange, getAllExercisesProgress]);

  const handleSelectExercise = useCallback(
    (exerciseId: number) => {
      const exercise = exercises.find((e) => e.exerciseId === exerciseId);
      setSelectedExerciseId(exerciseId);
      setSelectedExerciseName(exercise?.exerciseName ?? 'Exercise');
    },
    [exercises],
  );

  const handleBackFromDetail = () => {
    setSelectedExerciseId(null);
    setSelectedExerciseName('');
  };

  // If loading, show skeleton
  if (isLoading) {
    return <ProgressSkeleton />;
  }

  // If an exercise is selected, show the detail view
  if (selectedExerciseId) {
    return (
      <div className="p-4 pb-20">
        <ExerciseProgressDetail
          exerciseId={selectedExerciseId}
          exerciseName={selectedExerciseName}
          timeRange={timeRange}
          onBack={handleBackFromDetail}
        />
      </div>
    );
  }

  return (
    <div className="p-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="secondary"
          onClick={() => navigate('/workout')}
          className="p-2"
        >
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-xl font-bold text-white">Strength Progress</h1>
      </div>

      {/* Time Range Selector */}
      <TimeRangeSelector
        value={timeRange}
        onChange={setTimeRange}
        className="mb-4"
      />

      {/* Tab Selector */}
      <div className="flex gap-1 mb-6 bg-slate-800 p-1 rounded-lg">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'overview'
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('exercises')}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'exercises'
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Exercises
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' ? (
        <OverviewTab timeRange={timeRange} />
      ) : (
        <ExercisesTab
          timeRange={timeRange}
          onSelectExercise={handleSelectExercise}
        />
      )}
    </div>
  );
}
