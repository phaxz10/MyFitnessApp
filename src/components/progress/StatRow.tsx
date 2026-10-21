import { getTrendDirection, TrendIndicator } from '../ui';

export interface Stat {
  label: string;
  value: string | number;
  /** Small unit shown after the value, e.g. "kg". */
  unit?: string;
  /** Muted line under the value. */
  sub?: string;
  /** Percentage change vs the previous period. */
  change?: number;
  changeLabel?: string;
  /** Text colour class for the value. Defaults to text-ink. */
  valueClass?: string;
}

interface StatRowProps {
  stats: Stat[];
  className?: string;
}

function formatChange(val: number) {
  return `${val > 0 ? '+' : ''}${val.toFixed(1)}%`;
}

/** A compact row of figures separated by hairline rules (no tiles). */
export function StatRow({ stats, className = '' }: StatRowProps) {
  return (
    <dl
      className={`grid divide-x divide-line ${className}`}
      style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="min-w-0 px-3 py-3 first:pl-4 last:pr-4"
        >
          <dt className="truncate text-xs text-ink-3">{stat.label}</dt>
          <dd className="mt-1">
            <span
              className={`num text-2xl font-bold ${stat.valueClass ?? 'text-ink'}`}
            >
              {stat.value}
            </span>
            {stat.unit && (
              <span className="ml-1 text-xs text-ink-3">{stat.unit}</span>
            )}
            {stat.sub && (
              <p className="truncate text-xs text-ink-3">{stat.sub}</p>
            )}
            {stat.change !== undefined && (
              <TrendIndicator
                direction={getTrendDirection(stat.change)}
                size={14}
                label={formatChange(stat.change)}
                secondaryLabel={stat.changeLabel}
              />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
