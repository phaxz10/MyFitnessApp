import { isToday, isYesterday, parseLocalTimestamp } from '../../utils/date';
import { formatDurationFromMs } from '../../utils/formatters';

// Display helpers shared by the Training tab components.

/** Rep or time target: "8–12", "10", "30s". */
export function formatRepTarget(
  repMin: number | null,
  repMax: number | null,
  durationSeconds: number | null,
): string | null {
  if (durationSeconds) return `${durationSeconds}s`;
  if (repMin && repMax && repMin !== repMax) return `${repMin}–${repMax}`;
  const reps = repMin ?? repMax;
  return reps ? `${reps}` : null;
}

/** "Today", "Yesterday", or "Mon, Oct 20". */
export function formatRelativeDay(dateStr: string): string {
  if (isToday(dateStr)) return 'Today';
  if (isYesterday(dateStr)) return 'Yesterday';
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Elapsed time between two local timestamps (end defaults to now). */
export function formatElapsed(startedAt: string, endedAt: string | null) {
  const start = parseLocalTimestamp(startedAt);
  const end = endedAt ? parseLocalTimestamp(endedAt) : new Date();
  return formatDurationFromMs(end.getTime() - start.getTime());
}
