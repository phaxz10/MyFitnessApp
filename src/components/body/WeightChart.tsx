import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AXIS_TICK,
  TOOLTIP_CONTENT_STYLE,
  TOOLTIP_LABEL_STYLE,
} from '../progress/chartTheme';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  type TimeRange,
  TimeRangeSelector,
} from '../ui';

export interface WeightPoint {
  date: string;
  weight: number;
}

// Minimum visible span so a 0.3 kg wobble never looks like a cliff.
const MIN_SPAN_KG = 8;

function weightDomain(points: WeightPoint[]): [number, number] {
  const values = points.map((p) => p.weight);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  if (span >= MIN_SPAN_KG) return [Math.floor(min - 1), Math.ceil(max + 1)];
  const mid = (min + max) / 2;
  return [Math.floor(mid - MIN_SPAN_KG / 2), Math.ceil(mid + MIN_SPAN_KG / 2)];
}

interface WeightChartProps {
  data: WeightPoint[];
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}

export function WeightChart({
  data,
  timeRange,
  onTimeRangeChange,
}: WeightChartProps) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-3">
        <CardTitle>Weight trend</CardTitle>
      </CardHeader>
      <CardContent>
        <TimeRangeSelector
          value={timeRange}
          onChange={onTimeRangeChange}
          tone="body"
          className="mb-4"
        />
        {data.length > 0 ? (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
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
                  width={36}
                  domain={weightDomain(data)}
                />
                <Tooltip
                  contentStyle={TOOLTIP_CONTENT_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  formatter={(value) => [`${value} kg`, 'Weight']}
                />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="var(--body)"
                  strokeWidth={2.5}
                  dot={{ fill: 'var(--body)', strokeWidth: 0, r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-48 items-center justify-center text-center text-ink-3">
            No weigh-ins in this range. Pick a longer range or log one.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
