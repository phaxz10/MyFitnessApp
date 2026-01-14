/**
 * Shared TimeRangeSelector component
 * Used by: Progress, WeightTracker
 */

export type TimeRange = '7d' | '30d' | '90d' | 'all';

export const TIME_RANGE_OPTIONS: TimeRange[] = ['7d', '30d', '90d', 'all'];

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  /** Label to show for 'all' option. Defaults to 'All Time' */
  allLabel?: string;
  /** Additional CSS classes for the container */
  className?: string;
  /** Use compact styling (smaller padding). Defaults to false */
  compact?: boolean;
}

export function TimeRangeSelector({
  value,
  onChange,
  allLabel = 'All Time',
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
          {range === 'all' ? allLabel : range}
        </button>
      ))}
    </div>
  );
}
