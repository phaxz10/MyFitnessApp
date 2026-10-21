// Display helpers for the Progress > exercise detail view.

/** Detail line under the max-weight PR. Reps can be NULL on a logged set. */
export function formatMaxWeightDetail(reps: number | null): string {
  if (!reps) return 'Reps not logged';
  return `${reps} ${reps === 1 ? 'rep' : 'reps'}`;
}

/**
 * Empty-state copy for the 1RM chart. `sessionCount` is every session in
 * range; `plottedCount` is the ones with an estimated 1RM (weight and reps).
 */
export function oneRMEmptyMessage(
  sessionCount: number,
  plottedCount: number,
): string {
  if (plottedCount === 1) return 'Need one more session to show a trend.';
  if (sessionCount > 0) {
    return 'Log weight and reps on a set to estimate your 1RM.';
  }
  return 'No sessions logged for this exercise in this range.';
}

export function formatSessionCount(count: number): string {
  return `${count} ${count === 1 ? 'session' : 'sessions'}`;
}
