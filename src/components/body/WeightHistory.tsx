import { Plus } from 'lucide-react';
import type { WeightLog } from '../../types';
import { formatWeight } from '../../utils/calculations';
import { formatDisplayDate } from '../../utils/date';
import { Button, Card, CardContent, CardHeader, CardTitle } from '../ui';

interface WeightHistoryProps {
  logs: WeightLog[];
  onLog: () => void;
}

export function WeightHistory({ logs, onLog }: WeightHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent logs</CardTitle>
      </CardHeader>
      {logs.length === 0 ? (
        <CardContent className="space-y-3 text-center">
          <p className="text-ink-3">
            No weight logs yet. Log your first to start the trend.
          </p>
          <Button variant="secondary" onClick={onLog}>
            <Plus size={18} />
            Log weight
          </Button>
        </CardContent>
      ) : (
        <ul className="divide-y divide-line">
          {logs.slice(0, 10).map((log) => (
            <li
              key={log.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <p className="num font-semibold text-ink">
                  {formatDisplayDate(log.date)}
                </p>
                {log.body_fat_pct ? (
                  <p className="text-sm text-ink-3">
                    Body fat{' '}
                    <span className="num">{log.body_fat_pct.toFixed(1)}%</span>
                  </p>
                ) : null}
              </div>
              <p className="flex items-baseline gap-1">
                <span className="num text-xl font-bold text-ink">
                  {formatWeight(log.weight_kg)}
                </span>
                <span className="text-sm text-ink-3">kg</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
