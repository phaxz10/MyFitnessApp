/**
 * Time and number formatting utilities
 * Consolidates duplicate formatting functions across the codebase
 */

/**
 * Format seconds as MM:SS (e.g., 1:30, 12:05)
 * Used by: RestTimer, DurationTimer
 */
export function formatTimerDisplay(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format seconds as H:MM:SS or MM:SS based on duration
 * Used by: WorkoutSession elapsed time
 */
export function formatElapsedTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format minutes as human-readable duration (e.g., "45 min", "1h 30m")
 * Used by: Workout history, progress overview
 */
export function formatDurationMinutes(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

/**
 * Format milliseconds duration between two timestamps
 * Used by: Workout.tsx, WorkoutDetail.tsx
 */
export function formatDurationFromMs(durationMs: number): string {
  const mins = Math.floor(durationMs / 60000);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

/**
 * Format large numbers with K/M suffix
 * Used by: OverviewTab volume display
 */
export function formatLargeNumber(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${Math.round(value / 1000)}K`;
  return value.toString();
}

/**
 * Format volume with units (e.g., "150K lbs")
 * Used by: Progress overview
 */
export function formatVolume(value: number, unit = 'lbs'): string {
  return `${formatLargeNumber(value)} ${unit}`;
}
