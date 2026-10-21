import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ExerciseProgressDetail,
  ExercisesTab,
  OverviewTab,
} from '../components/progress';
import { SubpageHeader } from '../components/training/SubpageHeader';
import { type TimeRange, TimeRangeSelector } from '../components/ui';
import { useAllExercisesProgress } from '../hooks/useStrengthProgress';

type Tab = 'overview' | 'exercises';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'exercises', label: 'Exercises' },
];

export function Progress() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(
    null,
  );
  const [selectedExerciseName, setSelectedExerciseName] = useState<string>('');

  // TanStack Query keeps this cached across tab switches
  const { data: exercises = [] } = useAllExercisesProgress(timeRange);

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

  if (selectedExerciseId) {
    return (
      <div className="px-4 py-4">
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
    <div>
      <SubpageHeader
        title="Strength progress"
        onBack={() => navigate('/workout')}
      />
      <div className="space-y-4 px-4 py-4">
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />

        <div className="flex border-b border-line" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`h-11 flex-1 border-b-2 text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'border-train text-train-ink'
                  : 'border-transparent text-ink-2 hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' ? (
          <OverviewTab timeRange={timeRange} />
        ) : (
          <ExercisesTab
            timeRange={timeRange}
            onSelectExercise={handleSelectExercise}
          />
        )}
      </div>
    </div>
  );
}
