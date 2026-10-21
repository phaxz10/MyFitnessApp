import type { CoachingRequest } from '../../services/coaching/workoutCoach';
import type {
  AIExerciseCoachingResponse,
  ExerciseNote,
  WorkoutSet,
} from '../../types';

export interface CoachingCandidate {
  exerciseId: number;
  exerciseName: string;
  targetRepMin: number;
  targetRepMax: number;
  targetSets: number;
}

export interface CoachingLoaderDeps {
  /** Local DB read: recent completed sessions (oldest first) + notes. */
  loadContext: (exerciseId: number) => Promise<{
    history: { date: string; sets: WorkoutSet[] }[];
    notes: ExerciseNote[];
  }>;
  /** The single paid call for a batch of exercises. */
  fetchCoaching: (
    requests: CoachingRequest[],
  ) => Promise<Map<number, AIExerciseCoachingResponse>>;
  onResult: (coaching: Map<number, AIExerciseCoachingResponse>) => void;
}

/**
 * Session-scoped coaching loader (one per workout screen). Pure, so the
 * "one call per session, never re-fire after failure" contract is testable
 * without a DOM.
 *
 * - Every exercise is requested at most once: ids are marked BEFORE the
 *   await, so re-renders, StrictMode double effects and concurrent calls
 *   cannot start a second request for the same exercise.
 * - All not-yet-requested exercises go out in ONE batched call. Exercises
 *   added mid-session are batched in a follow-up call of their own.
 * - A failure is remembered: failed ids stay "requested" and are only sent
 *   again through an explicit retryFailed().
 */
export function createCoachingLoader(deps: CoachingLoaderDeps) {
  const requested = new Set<number>();
  const failed = new Set<number>();

  async function request(candidates: CoachingCandidate[]): Promise<void> {
    const fresh = dedupeById(candidates).filter(
      (c) => !requested.has(c.exerciseId),
    );
    if (fresh.length === 0) return;
    for (const c of fresh) requested.add(c.exerciseId);

    try {
      const contexts = await Promise.all(
        fresh.map((c) => deps.loadContext(c.exerciseId)),
      );
      // No history → nothing to progress from; skip (no AI call), as before.
      const requests: CoachingRequest[] = fresh.flatMap((c, i) =>
        contexts[i].history.length > 0
          ? [{ ...c, history: contexts[i].history, notes: contexts[i].notes }]
          : [],
      );
      if (requests.length === 0) return;

      const coaching = await deps.fetchCoaching(requests);
      deps.onResult(coaching);
    } catch (err) {
      for (const c of fresh) failed.add(c.exerciseId);
      console.error('Failed to fetch exercise coaching:', err);
    }
  }

  /** Manual retry (e.g. a "Retry coaching" button) — never automatic. */
  function retryFailed(candidates: CoachingCandidate[]): Promise<void> {
    for (const id of failed) requested.delete(id);
    failed.clear();
    return request(candidates);
  }

  return {
    request,
    retryFailed,
    hasFailures: () => failed.size > 0,
  };
}

function dedupeById(candidates: CoachingCandidate[]): CoachingCandidate[] {
  const seen = new Set<number>();
  return candidates.filter((c) => {
    if (seen.has(c.exerciseId)) return false;
    seen.add(c.exerciseId);
    return true;
  });
}
