import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keyedDebounce } from './debounce';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function recorder() {
  const saved: Array<[number, string]> = [];
  const save = keyedDebounce((setId: number, value: string) => {
    saved.push([setId, value]);
  }, 500);
  return { saved, save };
}

describe('set auto-save debounce', () => {
  // Regression: one shared timer dropped set 1's save when set 2 was edited.
  it('editing set 1 then set 2 within the window saves both', async () => {
    const { saved, save } = recorder();

    save.schedule(1, '100');
    vi.advanceTimersByTime(200);
    save.schedule(2, '80');
    await vi.advanceTimersByTimeAsync(500);

    expect(saved).toEqual([
      [1, '100'],
      [2, '80'],
    ]);
  });

  it('collapses a burst of edits to one set into its last value', async () => {
    const { saved, save } = recorder();

    save.schedule(1, '1');
    save.schedule(1, '10');
    save.schedule(1, '100');
    await vi.advanceTimersByTimeAsync(500);

    expect(saved).toEqual([[1, '100']]);
  });

  it('flush saves everything pending at once and only once', async () => {
    const { saved, save } = recorder();

    save.schedule(1, '100');
    save.schedule(2, '80');
    await save.flush();
    await vi.advanceTimersByTimeAsync(1000);

    expect(saved).toEqual([
      [1, '100'],
      [2, '80'],
    ]);
  });

  it('flush(key) saves just that key', async () => {
    const { saved, save } = recorder();

    save.schedule(1, '100');
    save.schedule(2, '80');
    await save.flush(2);
    expect(saved).toEqual([[2, '80']]);
    await vi.advanceTimersByTimeAsync(500);
    expect(saved).toEqual([
      [2, '80'],
      [1, '100'],
    ]);
  });
});

describe('cancel', () => {
  it('cancel(key) drops only that pending save', async () => {
    const { saved, save } = recorder();
    save.schedule(1, '100');
    save.schedule(2, '80');
    save.cancel(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(saved).toEqual([[2, '80']]);
  });
});
