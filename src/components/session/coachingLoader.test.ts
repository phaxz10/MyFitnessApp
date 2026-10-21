import { describe, expect, it, vi } from 'vitest';
import { createCoachingLoader } from './coachingLoader';

const candidates = [1, 2, 3].map((id) => ({
  exerciseId: id,
  exerciseName: `Lift ${id}`,
  targetRepMin: 8,
  targetRepMax: 12,
  targetSets: 3,
}));

function setup(fetchCoaching = vi.fn().mockResolvedValue(new Map())) {
  const loadContext = vi.fn().mockResolvedValue({
    history: [{ date: '2026-10-01', sets: [] }],
    notes: [],
  });
  const onResult = vi.fn();
  const loader = createCoachingLoader({ loadContext, fetchCoaching, onResult });
  return { loader, loadContext, fetchCoaching, onResult };
}

describe('createCoachingLoader', () => {
  it('sends all exercises in ONE call, and never again on re-render', async () => {
    const { loader, fetchCoaching, onResult } = setup();
    // StrictMode double effect + a re-render while in flight.
    await Promise.all([loader.request(candidates), loader.request(candidates)]);
    await loader.request(candidates);

    expect(fetchCoaching).toHaveBeenCalledTimes(1);
    expect(fetchCoaching.mock.calls[0][0]).toHaveLength(3);
    expect(onResult).toHaveBeenCalledTimes(1);
  });

  it('remembers a failure: no automatic re-call, only manual retry', async () => {
    const fetchCoaching = vi.fn().mockRejectedValue(new Error('500'));
    const { loader } = setup(fetchCoaching);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await loader.request(candidates);
    // Set logged → state change → effect re-runs. Must not re-fire.
    await loader.request(candidates);
    await loader.request(candidates);
    expect(fetchCoaching).toHaveBeenCalledTimes(1);
    expect(loader.hasFailures()).toBe(true);

    await loader.retryFailed(candidates);
    expect(fetchCoaching).toHaveBeenCalledTimes(2);
  });

  it('batches only newly added exercises in a follow-up call', async () => {
    const { loader, fetchCoaching } = setup();
    await loader.request(candidates.slice(0, 2));
    await loader.request(candidates);
    expect(fetchCoaching).toHaveBeenCalledTimes(2);
    expect(
      fetchCoaching.mock.calls[1][0].map(
        (r: { exerciseId: number }) => r.exerciseId,
      ),
    ).toEqual([3]);
  });

  it('skips the AI entirely when no exercise has history', async () => {
    const { loader, loadContext, fetchCoaching } = setup();
    loadContext.mockResolvedValue({ history: [], notes: [] });
    await loader.request(candidates);
    expect(fetchCoaching).not.toHaveBeenCalled();
  });
});
