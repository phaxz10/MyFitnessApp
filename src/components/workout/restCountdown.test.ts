import { describe, expect, it } from 'vitest';
import { reconcileCountdown } from './restCountdown';

const NOW = 1_000_000;

describe('reconcileCountdown', () => {
  // Regression: the session page opens the timer by setting isRunning=true
  // from outside. Nothing started the worker, so the sheet showed "Pause"
  // while frozen at 1:30.
  it('starts the countdown when running is set externally with no countdown', () => {
    expect(
      reconcileCountdown({
        isRunning: true,
        seconds: 90,
        endAt: null,
        now: NOW,
      }),
    ).toEqual({ type: 'start', endAt: NOW + 90_000 });
  });

  it('restarts when seconds are reset externally mid-countdown', () => {
    // 20s left on the worker, but the next set reset the rest to 90s.
    expect(
      reconcileCountdown({
        isRunning: true,
        seconds: 90,
        endAt: NOW + 20_000,
        now: NOW,
      }),
    ).toEqual({ type: 'start', endAt: NOW + 90_000 });
  });

  it('leaves a countdown alone while ticks keep seconds in sync', () => {
    expect(
      reconcileCountdown({
        isRunning: true,
        seconds: 60,
        endAt: NOW + 59_400,
        now: NOW,
      }),
    ).toBeNull();
  });

  it('stops a countdown when running is cleared externally', () => {
    expect(
      reconcileCountdown({
        isRunning: false,
        seconds: 40,
        endAt: NOW + 40_000,
        now: NOW,
      }),
    ).toEqual({ type: 'stop' });
  });

  it('does nothing when idle', () => {
    expect(
      reconcileCountdown({
        isRunning: false,
        seconds: 90,
        endAt: null,
        now: NOW,
      }),
    ).toBeNull();
  });
});
