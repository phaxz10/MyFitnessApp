import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useWeightUnit } from '../../hooks/useWeightUnit';
import type { ExerciseSessionData } from '../../types';
import { formatShortDate } from '../../utils/date';
import { toDisplayWeight, unitLabel } from '../../utils/units';
import { Card, CardContent, CardHeader, CardTitle } from '../ui';
import {
  AXIS_TICK,
  TOOLTIP_CONTENT_STYLE,
  TOOLTIP_LABEL_STYLE,
} from './chartTheme';
import { oneRMEmptyMessage } from './format';

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
  const unit = useWeightUnit();
  const chartData = data
    .filter((d) => d.estimated1RM !== null)
    .map((d) => ({
      date: formatShortDate(d.date),
      oneRM:
        d.estimated1RM === null
          ? null
          : toDisplayWeight(d.estimated1RM, unit, 'lift'),
      bestWeight:
        d.bestWeight === null
          ? null
          : toDisplayWeight(d.bestWeight, unit, 'lift'),
      bestReps: d.bestReps,
      volume: toDisplayWeight(d.totalVolume, unit, 'volume'),
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {exerciseName && <p className="text-sm text-ink-2">{exerciseName}</p>}
      </CardHeader>
      <CardContent>
        {chartData.length > 1 ? (
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid
                  stroke="var(--line)"
                  strokeDasharray="0"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 'auto']}
                  tickFormatter={(value: number) => `${value}`}
                />
                <Tooltip
                  contentStyle={TOOLTIP_CONTENT_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  formatter={(value, name) => {
                    if (value === undefined) return ['--', String(name ?? '')];
                    if (name === 'oneRM')
                      return [`${value} ${unitLabel(unit)}`, 'Est. 1RM'];
                    return [String(value), String(name ?? '')];
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="oneRM"
                  stroke="var(--train)"
                  strokeWidth={2.5}
                  dot={{ fill: 'var(--train)', strokeWidth: 0, r: 4 }}
                  activeDot={{ r: 6, fill: 'var(--train)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div
            className="flex items-center justify-center text-center text-ink-3"
            style={{ height }}
          >
            {oneRMEmptyMessage(data.length, chartData.length)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
