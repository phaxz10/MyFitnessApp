// The rest timer's `isRunning` / `seconds` are controlled by the session page
// (completing a set starts the rest), but the countdown itself lives in a Web
// Worker keyed by an absolute `endAt`. This decides what the worker must do so
// that it always agrees with the props, whoever changed them.

export type CountdownCommand =
  | { type: 'start'; endAt: number }
  | { type: 'stop' }
  | null;

/** Ticks and render latency can put props and worker up to ~1s apart. */
const DRIFT_TOLERANCE_SECONDS = 1;

export function reconcileCountdown({
  isRunning,
  seconds,
  endAt,
  now,
}: {
  isRunning: boolean;
  seconds: number;
  endAt: number | null;
  now: number;
}): CountdownCommand {
  if (!isRunning) return endAt === null ? null : { type: 'stop' };
  if (seconds <= 0) return null;

  const start = { type: 'start', endAt: now + seconds * 1000 } as const;
  if (endAt === null) return start;

  const remaining = Math.max(0, Math.ceil((endAt - now) / 1000));
  return Math.abs(remaining - seconds) > DRIFT_TOLERANCE_SECONDS ? start : null;
}
