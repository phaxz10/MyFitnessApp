import { Clock, Dumbbell, Target, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useExerciseProgress } from '../../hooks/useExerciseProgress';
import type {
  OverallProgressMetrics,
  PersonalRecord,
  VolumeChartData,
} from '../../types';
import {
  formatDurationMinutes,
  formatLargeNumber,
} from '../../utils/formatters';
import { Card, CardContent } from '../ui';
import { MetricCard } from './MetricCard';
import { VolumeChart } from './VolumeChart';

interface OverviewTabProps {
  timeRange: '7d' | '30d' | '90d' | 'all';
}

export function OverviewTab({ timeRange }: OverviewTabProps) {
  const { getOverallProgress, getVolumeChartData, loading } =
    useExerciseProgress();

  const [metrics, setMetrics] = useState<OverallProgressMetrics | null>(null);
  const [volumeData, setVolumeData] = useState<VolumeChartData[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const [progressData, chartData] = await Promise.all([
        getOverallProgress(timeRange),
        getVolumeChartData(timeRange),
      ]);
      setMetrics(progressData);
      setVolumeData(chartData);
    };
    fetchData();
  }, [timeRange, getOverallProgress, getVolumeChartData]);

  if (loading && !metrics) {
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
