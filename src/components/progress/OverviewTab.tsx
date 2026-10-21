import { Dumbbell, Trophy } from 'lucide-react';
import {
  type TimeRange,
  useOverallProgress,
  useVolumeChartData,
  useWeeklyMuscleStats,
} from '../../hooks/useStrengthProgress';
import { useWeightUnit } from '../../hooks/useWeightUnit';
import type { PersonalRecord, WeightUnit } from '../../types';
import {
  formatDurationMinutes,
  formatLargeNumber,
} from '../../utils/formatters';
import { formatWeight, toDisplayWeight, unitLabel } from '../../utils/units';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  SkeletonCard,
  SkeletonChart,
} from '../ui';
import { MuscleHeatmap } from './MuscleHeatmap';
import { StatRow } from './StatRow';
import { VolumeChart } from './VolumeChart';

interface OverviewTabProps {
  timeRange: TimeRange;
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonCard>
        <Skeleton className="h-14 w-full" />
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonChart />
      </SkeletonCard>
    </div>
  );
}

function formatPR(pr: PersonalRecord, unit: WeightUnit): string {
  switch (pr.type) {
    case 'weight':
      return formatWeight(pr.value, unit, 'lift');
    case '1rm':
      return `Est. ${formatWeight(pr.value, unit, 'lift')}`;
    case 'volume':
      return formatWeight(pr.value, unit, 'volume');
    case 'reps':
      return `${pr.value} reps`;
  }
}

function RecentPRs({ prs }: { prs: PersonalRecord[] }) {
  const unit = useWeightUnit();
  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <Trophy className="text-warn" size={18} />
        <CardTitle>Recent personal records</CardTitle>
      </CardHeader>
      <ul className="divide-y divide-line">
        {prs.map((pr, index) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: recentPRs has no stable id; static, non-reordering summary list
            key={`${pr.exerciseId}-${pr.type}-${index}`}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">
                {pr.exerciseName}
              </p>
              <p className="text-sm text-ink-3">
                {pr.type === '1rm' ? 'Est. 1RM' : pr.type}
              </p>
            </div>
            <p className="num shrink-0 text-lg font-bold text-ink">
              {formatPR(pr, unit)}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function OverviewTab({ timeRange }: OverviewTabProps) {
  const weightUnit = useWeightUnit();
  const { data: metrics, isLoading: metricsLoading } =
    useOverallProgress(timeRange);

  const { data: volumeData = [], isLoading: volumeLoading } =
    useVolumeChartData(timeRange);

  const { data: weeklyMuscles, isLoading: musclesLoading } =
    useWeeklyMuscleStats();

  if ((metricsLoading || volumeLoading) && !metrics) {
    return <OverviewSkeleton />;
  }

  const prCount = metrics?.recentPRs.length ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <StatRow
          stats={[
            {
              label: 'Volume',
              value: metrics
                ? formatLargeNumber(
                    toDisplayWeight(metrics.totalVolume, weightUnit, 'volume'),
                  )
                : '--',
              unit: metrics ? unitLabel(weightUnit) : undefined,
              change: metrics?.volumeChange,
              changeLabel: 'vs prev',
            },
            {
              label: 'Workouts',
              value: metrics?.totalWorkouts ?? '--',
              sub: metrics ? `${metrics.uniqueExercises} exercises` : undefined,
            },
            {
              label: 'Time',
              value: metrics
                ? formatDurationMinutes(metrics.totalTimeMinutes)
                : '--',
            },
            {
              label: 'PRs',
              value: prCount,
              sub: 'last 7 days',
              valueClass: prCount > 0 ? 'text-warn' : 'text-ink',
            },
          ]}
        />
      </Card>

      {weeklyMuscles && !musclesLoading && (
        <MuscleHeatmap
          breakdown={weeklyMuscles.breakdown}
          totalSets={weeklyMuscles.totalSets}
          weekStart={weeklyMuscles.weekStart}
          weekEnd={weeklyMuscles.weekEnd}
        />
      )}

      {musclesLoading && (
        <SkeletonCard>
          <Skeleton className="mb-4 h-6 w-48" />
          <div className="grid grid-cols-2 gap-2">
            {['a', 'b', 'c', 'd', 'e', 'f'].map((id) => (
              <Skeleton key={id} className="h-20 rounded-lg" />
            ))}
          </div>
        </SkeletonCard>
      )}

      <VolumeChart data={volumeData} title="Training volume" height={180} />

      {metrics && prCount > 0 && <RecentPRs prs={metrics.recentPRs} />}

      {metrics && metrics.totalWorkouts === 0 && prCount === 0 && (
        <Card>
          <CardContent className="space-y-1 py-8 text-center">
            <Dumbbell className="mx-auto mb-3 text-ink-3" size={40} />
            <p className="font-semibold text-ink">No workout data yet</p>
            <p className="text-sm text-ink-3">
              Complete your first workout to start tracking progress.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
