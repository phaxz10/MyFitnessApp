import type { ExerciseSessionData } from '../../types';
import { formatDisplayDate } from '../../utils/date';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '../ui';

interface SessionHistoryCardProps {
  sessions: ExerciseSessionData[];
  isLoading: boolean;
}

export function SessionHistoryCard({
  sessions,
  isLoading,
}: SessionHistoryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Session history</CardTitle>
      </CardHeader>
      {sessions.length === 0 ? (
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <p className="text-center text-ink-3">
              No sessions in this time range. Try a longer range.
            </p>
          )}
        </CardContent>
      ) : (
        <ul className="divide-y divide-line">
          {sessions
            .slice()
            .reverse()
            .slice(0, 10)
            .map((session) => (
              <li key={session.date} className="space-y-2 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="num font-semibold text-ink">
                    {formatDisplayDate(session.date)}
                  </p>
                  {session.estimated1RM && (
                    <p className="num text-sm font-semibold text-train-ink">
                      1RM {session.estimated1RM} lbs
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {session.sets.map((set, setIndex) => (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: sets have no stable id; static read-only list that never reorders
                      key={`${session.date}-set-${setIndex}-${set.weight}-${set.reps}`}
                      className="num rounded-lg bg-sunken px-2 py-1 text-sm text-ink-2"
                    >
                      {set.weight ?? 0} x {set.reps ?? 0}
                    </span>
                  ))}
                </div>
                <p className="num text-sm text-ink-3">
                  Volume {session.totalVolume.toLocaleString()} lbs
                </p>
              </li>
            ))}
        </ul>
      )}
    </Card>
  );
}
