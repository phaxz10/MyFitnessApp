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
  /** Discipline colour of the selected segment. Defaults to train. */
  tone?: 'train' | 'body';
}

const ACTIVE_TONE = {
  train: 'bg-train text-on-accent',
  body: 'bg-body text-on-accent',
};

export function TimeRangeSelector({
  value,
  onChange,
  className = '',
  compact = false,
  tone = 'train',
}: TimeRangeSelectorProps) {
  return (
    <fieldset
      className={`m-0 flex min-w-0 gap-1 rounded-xl border-0 bg-sunken p-1 ${className}`}
      aria-label="Time range"
    >
      {TIME_RANGE_OPTIONS.map((range) => (
        <button
          key={range}
          type="button"
          onClick={() => onChange(range)}
          aria-pressed={value === range}
          className={`${compact ? 'px-3 h-10' : 'flex-1 h-10'} rounded-lg text-sm font-semibold transition-colors ${
            value === range ? ACTIVE_TONE[tone] : 'text-ink-2 hover:text-ink'
          }`}
        >
          {TIME_RANGE_LABELS[range]}
        </button>
      ))}
    </fieldset>
  );
}
