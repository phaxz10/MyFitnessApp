import { ChevronRight } from 'lucide-react';
import type { WorkoutLogWithSets } from '../../hooks/useWorkoutLogs';
import { Card } from '../ui';
import { formatElapsed, formatRelativeDay } from './format';

interface RecentWorkoutsProps {
  logs: WorkoutLogWithSets[];
  onOpen: (logId: number) => void;
}

export function RecentWorkouts({ logs, onOpen }: RecentWorkoutsProps) {
  return (
    <Card>
      <ul className="divide-y divide-line">
        {logs.map((log) => (
          <li key={log.id}>
            <button
              type="button"
              onClick={() => onOpen(log.id)}
              className="w-full flex items-center gap-3 px-4 py-3 min-h-14 text-left hover:bg-sunken transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="truncate">
                  <span className="font-semibold text-ink">
                    {log.session_name || 'Quick Workout'}
                  </span>
                  {log.program_name && (
                    <span className="text-ink-3 text-sm ml-2">
                      {log.program_name}
                    </span>
                  )}
                </p>
                <p className="flex items-center gap-2 text-ink-2 text-sm mt-0.5">
                  <span className="num">{formatRelativeDay(log.date)}</span>
                  {log.ended_at && (
                    <>
                      <span className="text-ink-3" aria-hidden="true">
                        ·
                      </span>
                      <span className="num">
                        {formatElapsed(log.started_at, log.ended_at)}
                      </span>
                    </>
                  )}
                  <span className="text-ink-3" aria-hidden="true">
                    ·
                  </span>
                  <span>
                    <span className="num">{log.sets.length}</span> sets
                  </span>
                </p>
              </div>
              <ChevronRight
                size={20}
                className="text-ink-3 shrink-0"
                aria-hidden="true"
              />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
