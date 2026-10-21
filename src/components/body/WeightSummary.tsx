import type { WeightLog } from '../../types';
import { formatWeight } from '../../utils/calculations';
import { formatDisplayDate } from '../../utils/date';
import {
  Card,
  getTrendColorClass,
  getTrendDirection,
  TrendIndicator,
} from '../ui';

interface WeightSummaryProps {
  latestLog: WeightLog | null;
  weeklyChange: number;
  hasEnoughData: boolean;
  hasMultipleLogs: boolean;
  onTrack: boolean;
}

export function WeightSummary({
  latestLog,
  weeklyChange,
  hasEnoughData,
  hasMultipleLogs,
  onTrack,
}: WeightSummaryProps) {
  // 0.1 kg threshold: smaller moves are noise, not a trend.
  const direction = getTrendDirection(weeklyChange, 0.1);
  const bodyFat = latestLog?.body_fat_pct;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 rounded-t-xl bg-body-soft p-4">
        <div>
          <p className="text-sm font-semibold text-body-ink">Current weight</p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="num text-6xl font-bold text-ink">
              {latestLog ? formatWeight(latestLog.weight_kg) : '--'}
            </span>
            {latestLog && (
              <span className="text-lg font-semibold text-ink-3">kg</span>
            )}
          </p>
          {latestLog && (
            <p className="mt-1 text-sm text-body-ink">
              Logged {formatDisplayDate(latestLog.date)}
            </p>
          )}
        </div>
        {hasEnoughData && (
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${
              onTrack
                ? 'bg-eat-soft text-eat-ink'
                : 'bg-danger-soft text-danger'
            }`}
          >
            {onTrack ? 'On track' : 'Off track'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 divide-x divide-line border-t border-line">
        <div className="p-4">
          <p className="text-sm text-ink-2">
            {hasEnoughData ? 'Weekly change' : 'Recent change'}
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            <TrendIndicator direction={direction} size={20} iconOnly />
            <span
              className={`num text-2xl font-bold ${getTrendColorClass(direction)}`}
            >
              {weeklyChange > 0 ? '+' : ''}
              {formatWeight(weeklyChange)}
            </span>
            <span className="text-sm text-ink-3">
              kg{hasEnoughData ? '/wk' : ''}
            </span>
          </div>
          {!hasEnoughData && hasMultipleLogs && (
            <p className="mt-1 text-xs text-ink-3">
              Log for 3+ days for weekly trend
            </p>
          )}
        </div>
        <div className="p-4">
          <p className="text-sm text-ink-2">Body fat</p>
          <p className="mt-1 flex items-baseline gap-1">
            <span className="num text-2xl font-bold text-ink">
              {bodyFat ? bodyFat.toFixed(1) : '--'}
            </span>
            {bodyFat ? <span className="text-sm text-ink-3">%</span> : null}
          </p>
        </div>
      </div>
    </Card>
  );
}
