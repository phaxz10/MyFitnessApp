import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Card, CardContent } from '../ui';
import type { ExerciseSessionData } from '../../types';
import { formatShortDate } from '../../utils/date';

interface OneRMChartProps {
  data: ExerciseSessionData[];
  title?: string;
  height?: number;
  exerciseName?: string;
}

export function OneRMChart({
  data,
  title = 'Estimated 1RM Progress',
  height = 200,
  exerciseName,
}: OneRMChartProps) {
  const chartData = data
    .filter((d) => d.estimated1RM !== null)
    .map((d) => ({
      date: formatShortDate(d.date),
      oneRM: d.estimated1RM,
      bestWeight: d.bestWeight,
      bestReps: d.bestReps,
      volume: d.totalVolume,
    }));

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
        {exerciseName && (
          <p className="text-slate-400 text-sm mb-4">{exerciseName}</p>
        )}
        {chartData.length > 1 ? (
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis
                  dataKey="date"
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
                  domain={['dataMin - 10', 'dataMax + 10']}
                  tickFormatter={(value: number) => `${value}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: '#94a3b8' }}
                  formatter={(
                    value: number | undefined,
                    name: string | undefined,
                  ) => {
                    if (value === undefined) return ['--', name ?? ''];
                    if (name === 'oneRM') return [`${value} lbs`, 'Est. 1RM'];
                    return [value, name ?? ''];
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="oneRM"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', strokeWidth: 0, r: 4 }}
                  activeDot={{ r: 6, fill: '#60a5fa' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div
            className="flex items-center justify-center text-slate-500"
            style={{ height }}
          >
            {chartData.length === 1
              ? 'Need more sessions to show trend'
              : 'No data available'}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
