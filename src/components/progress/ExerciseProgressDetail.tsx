import { Dumbbell } from 'lucide-react';
import {
  type TimeRange,
  useAllExercisesProgress,
  useExercisePRs,
  useExerciseSessionData,
} from '../../hooks/useStrengthProgress';
import {
  Card,
  CardContent,
  ExerciseMark,
  getProgressTrendLabel,
  progressTrendToDirection,
  Skeleton,
  SkeletonCard,
  SkeletonChart,
  TrendIndicator,
} from '../ui';
import { BackButton } from './BackButton';
import { formatSessionCount } from './format';
import { OneRMChart } from './OneRMChart';
import { PersonalRecordsCard } from './PersonalRecordsCard';
import { SessionHistoryCard } from './SessionHistoryCard';

interface ExerciseProgressDetailProps {
  exerciseId: number;
  exerciseName: string;
  timeRange: TimeRange;
  onBack: () => void;
}

export function ExerciseProgressDetail({
  exerciseId,
  exerciseName,
  timeRange,
  onBack,
}: ExerciseProgressDetailProps) {
  const { data: sessions = [], isLoading: sessionsLoading } =
    useExerciseSessionData(exerciseId, timeRange);

  const { data: prs, isLoading: prsLoading } = useExercisePRs(exerciseId);

  const { data: allExercises = [] } = useAllExercisesProgress(timeRange);

  const summary = allExercises.find((p) => p.exerciseId === exerciseId) ?? null;

  const isLoading = sessionsLoading || prsLoading;

  if (isLoading && sessions.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-11 w-2/3" />
        <SkeletonCard>
          <SkeletonChart />
        </SkeletonCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <BackButton onClick={onBack} label="Back to exercises" />
        <ExerciseMark
          name={exerciseName}
          muscleGroups={summary?.muscleGroups}
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold text-ink">
            {exerciseName}
          </h2>
          {summary && (
            <div className="flex items-center gap-2">
              <TrendIndicator
                direction={progressTrendToDirection(summary.trend)}
                label={getProgressTrendLabel(summary.trend)}
              />
              <span className="num text-sm text-ink-3">
                {formatSessionCount(summary.totalSessions)}
              </span>
            </div>
          )}
        </div>
      </div>

      <OneRMChart data={sessions} title="Estimated 1RM" height={200} />

      {prs && <PersonalRecordsCard prs={prs} />}

      <SessionHistoryCard sessions={sessions} isLoading={isLoading} />

      {sessions.length === 0 && !prs && !isLoading && (
        <Card>
          <CardContent className="space-y-1 py-8 text-center">
            <Dumbbell className="mx-auto mb-3 text-ink-3" size={40} />
            <p className="font-semibold text-ink">No data for this exercise</p>
            <p className="text-sm text-ink-3">
              Log it in a workout to start tracking.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
