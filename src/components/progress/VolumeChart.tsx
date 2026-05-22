import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Card, CardContent } from '../ui';
import type { VolumeChartData } from '../../types';
import { formatShortDate } from '../../utils/date';

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
    volumeK: Math.round(d.volume / 1000), // Convert to thousands
  }));

  const formatVolume = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return value.toString();
  };

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
        {chartData.length > 0 ? (
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient
                    id="volumeGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="displayDate"
                  stroke="#64748b"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatVolume}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: '#94a3b8' }}
                  formatter={(value) => [
                    typeof value === 'number' ? `${formatVolume(value)} lbs` : '--',
                    'Volume',
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="volume"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#volumeGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div
            className="flex items-center justify-center text-slate-500"
            style={{ height }}
          >
            No volume data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
