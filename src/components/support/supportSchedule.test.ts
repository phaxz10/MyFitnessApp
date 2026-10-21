import { describe, expect, it } from 'vitest';
import {
  answer,
  freshState,
  MIN_ACTIVE_DAYS,
  recordActiveDay,
  shouldAsk,
} from './supportSchedule';

const DAY = 86_400_000;
const t0 = Date.UTC(2026, 0, 1);

function used(days: number) {
  let s = freshState(t0);
  for (let i = 0; i < days; i++)
    s = recordActiveDay(s, `2026-01-${String(i + 1).padStart(2, '0')}`);
  return s;
}

describe('support prompt timing', () => {
  it('waits for enough active days and app age', () => {
    expect(shouldAsk(used(MIN_ACTIVE_DAYS - 1), t0 + 30 * DAY)).toBe(false);
    expect(shouldAsk(used(MIN_ACTIVE_DAYS), t0 + 13 * DAY)).toBe(false);
    expect(shouldAsk(used(MIN_ACTIVE_DAYS), t0 + 14 * DAY)).toBe(true);
  });

  it('counts a day once', () => {
    const s = recordActiveDay(
      recordActiveDay(freshState(t0), '2026-01-01'),
      '2026-01-01',
    );
    expect(s.activeDays).toHaveLength(1);
  });

  it('snoozes, thanks for longer, and never means never', () => {
    const now = t0 + 20 * DAY;
    const later = answer(used(10), 'later', now);
    expect(shouldAsk(later, now + 44 * DAY)).toBe(false);
    expect(shouldAsk(later, now + 45 * DAY)).toBe(true);
    expect(shouldAsk(answer(used(10), 'thanks', now), now + 100 * DAY)).toBe(
      false,
    );
    expect(shouldAsk(answer(used(10), 'never', now), now + 1000 * DAY)).toBe(
      false,
    );
  });
});
