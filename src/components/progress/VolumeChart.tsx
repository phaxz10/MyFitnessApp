import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { VolumeChartData } from '../../types';
import { formatShortDate } from '../../utils/date';
import { Card, CardContent, CardHeader, CardTitle } from '../ui';
import {
  AXIS_TICK,
  TOOLTIP_CONTENT_STYLE,
  TOOLTIP_LABEL_STYLE,
} from './chartTheme';

interface VolumeChartProps {
  data: VolumeChartData[];
  title?: string;
  height?: number;
}

export function VolumeChart({
  data,
  title = 'Volume Trend',
  height = 200,
}: VolumeChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    displayDate: formatShortDate(d.date),
  }));

  const formatVolume = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return value.toString();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid
                  stroke="var(--line)"
                  strokeDasharray="0"
                  vertical={false}
                />
                <XAxis
                  dataKey="displayDate"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatVolume}
                />
                <Tooltip
                  contentStyle={TOOLTIP_CONTENT_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  formatter={(value) => [
                    typeof value === 'number'
                      ? `${formatVolume(value)} lbs`
                      : '--',
                    'Volume',
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="volume"
                  stroke="var(--train)"
                  strokeWidth={2.5}
                  fill="var(--train-soft)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div
            className="flex items-center justify-center text-center text-ink-3"
            style={{ height }}
          >
            No volume logged in this range yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
