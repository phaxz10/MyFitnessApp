import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent } from '../ui';

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  color?: 'default' | 'blue' | 'green' | 'yellow' | 'red';
}

export function MetricCard({
  label,
  value,
  subValue,
  change,
  changeLabel,
  icon,
  color = 'default',
}: MetricCardProps) {
  const colorClasses = {
    default: 'text-white',
    blue: 'text-blue-400',
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
  };

  const getTrendIcon = () => {
    if (change === undefined || change === null) return null;
    if (change > 0) return <TrendingUp className="text-green-400" size={16} />;
    if (change < 0) return <TrendingDown className="text-red-400" size={16} />;
    return <Minus className="text-slate-400" size={16} />;
  };

  const formatChange = (val: number) => {
    const prefix = val > 0 ? '+' : '';
    return `${prefix}${val.toFixed(1)}%`;
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-slate-400 text-sm mb-1">{label}</p>
            <p className={`text-2xl font-bold ${colorClasses[color]}`}>
              {value}
            </p>
            {subValue && (
              <p className="text-slate-500 text-xs mt-0.5">{subValue}</p>
            )}
            {change !== undefined && (
              <div className="flex items-center gap-1 mt-1">
                {getTrendIcon()}
                <span
                  className={`text-sm ${
                    change > 0
                      ? 'text-green-400'
                      : change < 0
                        ? 'text-red-400'
                        : 'text-slate-400'
                  }`}
                >
                  {formatChange(change)}
                  {changeLabel && (
                    <span className="text-slate-500 ml-1">{changeLabel}</span>
                  )}
                </span>
              </div>
            )}
          </div>
          {icon && <div className="text-slate-500">{icon}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
