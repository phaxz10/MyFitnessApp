import { Clock, Dumbbell, Target, Trophy } from 'lucide-react';
import {
  type TimeRange,
  useOverallProgress,
  useVolumeChartData,
  useWeeklyMuscleStats,
} from '../../hooks/useStrengthProgress';
import type { PersonalRecord } from '../../types';
import {
  formatDurationMinutes,
  formatLargeNumber,
} from '../../utils/formatters';
import { Card, CardContent } from '../ui';
import { MetricCard } from './MetricCard';
import { MuscleHeatmap } from './MuscleHeatmap';
import { VolumeChart } from './VolumeChart';

interface OverviewTabProps {
  timeRange: TimeRange;
}

export function OverviewTab({ timeRange }: OverviewTabProps) {
  const { data: metrics, isLoading: metricsLoading } =
    useOverallProgress(timeRange);

  const { data: volumeData = [], isLoading: volumeLoading } =
    useVolumeChartData(timeRange);

  const { data: weeklyMuscles, isLoading: musclesLoading } =
    useWeeklyMuscleStats();

  const isLoading = metricsLoading || volumeLoading;

  if (isLoading && !metrics) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Total Volume"
          value={
            metrics ? `${formatLargeNumber(metrics.totalVolume)} lbs` : '--'
          }
          change={metrics?.volumeChange}
          changeLabel="vs prev"
          icon={<Dumbbell size={20} />}
        />
        <MetricCard
          label="Workouts"
          value={metrics?.totalWorkouts ?? '--'}
          subValue={
            metrics ? `${metrics.uniqueExercises} exercises` : undefined
          }
          icon={<Target size={20} />}
        />
        <MetricCard
          label="Time Trained"
          value={
            metrics ? formatDurationMinutes(metrics.totalTimeMinutes) : '--'
          }
          icon={<Clock size={20} />}
        />
        <MetricCard
          label="Recent PRs"
          value={metrics?.recentPRs.length ?? 0}
          subValue="last 7 days"
          icon={<Trophy size={20} />}
          color={metrics && metrics.recentPRs.length > 0 ? 'yellow' : 'default'}
        />
      </div>

      {/* Weekly Muscle Coverage */}
      {weeklyMuscles && !musclesLoading && (
        <MuscleHeatmap
          breakdown={weeklyMuscles.breakdown}
          totalSets={weeklyMuscles.totalSets}
          weekStart={weeklyMuscles.weekStart}
          weekEnd={weeklyMuscles.weekEnd}
        />
      )}

      {musclesLoading && (
        <Card>
          <CardContent className="p-4">
            <div className="animate-pulse">
              <div className="h-6 bg-slate-700 rounded w-48 mb-4" />
              <div className="grid grid-cols-2 gap-2">
                {[
                  'chest',
                  'back',
                  'shoulders',
                  'biceps',
                  'triceps',
                  'legs',
                ].map((muscle) => (
                  <div
                    key={`skeleton-${muscle}`}
                    className="h-20 bg-slate-800 rounded"
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Volume Chart */}
      <VolumeChart data={volumeData} title="Training Volume" height={180} />

      {/* Recent PRs */}
      {metrics && metrics.recentPRs.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <Trophy className="text-yellow-400" size={20} />
              Recent Personal Records
            </h3>
            <div className="space-y-2">
              {metrics.recentPRs.map((pr: PersonalRecord, index: number) => (
                <div
                  key={`${pr.exerciseId}-${pr.type}-${index}`}
                  className="flex justify-between items-center py-2 border-b border-slate-700 last:border-0"
                >
                  <div>
                    <p className="text-white font-medium">{pr.exerciseName}</p>
                    <p className="text-slate-400 text-sm capitalize">
                      {pr.type === '1rm' ? 'Est. 1RM' : pr.type}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-yellow-400 font-bold">{pr.details}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {metrics &&
        metrics.totalWorkouts === 0 &&
        metrics.recentPRs.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <Dumbbell className="mx-auto mb-3 text-slate-600" size={48} />
              <p className="text-slate-400 mb-2">No workout data yet</p>
              <p className="text-slate-500 text-sm">
                Complete your first workout to start tracking progress
              </p>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
