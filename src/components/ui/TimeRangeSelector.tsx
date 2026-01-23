/**
 * Shared TimeRangeSelector component
 * Used by: Progress, WeightTracker
 */

export type TimeRange = '7d' | '30d' | '90d' | 'all';

export const TIME_RANGE_OPTIONS: TimeRange[] = ['7d', '30d', '90d', 'all'];

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  '7d': 'this week',
  '30d': '30 days',
  '90d': '90 days',
  all: 'all time',
};

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  /** Additional CSS classes for the container */
  className?: string;
  /** Use compact styling (smaller padding). Defaults to false */
  compact?: boolean;
}

export function TimeRangeSelector({
  value,
  onChange,
  className = '',
  compact = false,
}: TimeRangeSelectorProps) {
  return (
    <div className={`flex gap-1 ${className}`}>
      {TIME_RANGE_OPTIONS.map((range) => (
        <button
          key={range}
          type="button"
          onClick={() => onChange(range)}
          className={`${compact ? 'px-3 py-1' : 'flex-1 py-2'} rounded text-sm font-medium transition-colors ${
            value === range
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700 text-slate-400 hover:text-white'
          }`}
        >
          {TIME_RANGE_LABELS[range]}
        </button>
      ))}
    </div>
  );
}
