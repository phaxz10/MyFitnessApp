/**
 * Shared TrendIndicator component
 * Displays trend direction with icon and optional value
 * Used by: MetricCard, ExercisesTab, WeightTracker
 */

import { Minus, TrendingDown, TrendingUp } from 'lucide-react';

export type TrendDirection = 'up' | 'down' | 'neutral';

interface TrendIndicatorProps {
  /** The direction of the trend */
  direction: TrendDirection;
  /** Optional size for the icon. Defaults to 16 */
  size?: number;
  /** Optional label text to display next to the icon */
  label?: string;
  /** Optional secondary label (shown in muted color) */
  secondaryLabel?: string;
  /** Show only the icon without any labels */
  iconOnly?: boolean;
}

/**
 * Get trend direction from a numeric value
 * @param value - The numeric change value
 * @param threshold - Optional threshold for considering a change significant. Defaults to 0
 */
export function getTrendDirection(
  value: number | null | undefined,
  threshold = 0,
): TrendDirection {
  if (value === null || value === undefined) return 'neutral';
  if (value > threshold) return 'up';
  if (value < -threshold) return 'down';
  return 'neutral';
}

/**
 * Convert ProgressTrend string to TrendDirection
 * Used by ExercisesTab which uses 'progressing' | 'regressing' | 'plateau'
 */
export function progressTrendToDirection(
  trend: 'progressing' | 'regressing' | 'plateau',
): TrendDirection {
  switch (trend) {
    case 'progressing':
      return 'up';
    case 'regressing':
      return 'down';
    default:
      return 'neutral';
  }
}

/**
 * Get trend label from ProgressTrend
 */
export function getProgressTrendLabel(
  trend: 'progressing' | 'regressing' | 'plateau',
): string {
  switch (trend) {
    case 'progressing':
      return 'Progressing';
    case 'regressing':
      return 'Regressing';
    default:
      return 'Plateau';
  }
}

/**
 * Get trend color class based on direction
 */
export function getTrendColorClass(direction: TrendDirection): string {
  switch (direction) {
    case 'up':
      return 'text-green-400';
    case 'down':
      return 'text-red-400';
    default:
      return 'text-slate-400';
  }
}

export function TrendIndicator({
  direction,
  size = 16,
  label,
  secondaryLabel,
  iconOnly = false,
}: TrendIndicatorProps) {
  const colorClass = getTrendColorClass(direction);

  const icon = (() => {
    switch (direction) {
      case 'up':
        return <TrendingUp className={colorClass} size={size} />;
      case 'down':
        return <TrendingDown className={colorClass} size={size} />;
      default:
        return <Minus className={colorClass} size={size} />;
    }
  })();

  if (iconOnly) {
    return icon;
  }

  return (
    <div className="flex items-center gap-1">
      {icon}
      {label && (
        <span className={`text-sm ${colorClass}`}>
          {label}
          {secondaryLabel && (
            <span className="text-slate-500 ml-1">{secondaryLabel}</span>
          )}
        </span>
      )}
    </div>
  );
}
