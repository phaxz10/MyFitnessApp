import { useEffect, useRef, useState } from 'react';
import { useWeightUnit } from '../../hooks/useWeightUnit';
import type { ExerciseWithSets } from '../../hooks/useWorkoutSession';
import { getAICapability } from '../../services/ai/useAICapability';
import { getSessionCoaching } from '../../services/coaching/workoutCoach';
import { getDB } from '../../services/db';
import { sessions as exerciseSessions } from '../../services/queries/exerciseHistory';
import type { AIExerciseCoachingResponse, ExerciseNote } from '../../types';
import type { WeightUnit } from '../../utils/units';
import { type CoachingCandidate, createCoachingLoader } from './coachingLoader';

// Fetches AI coaching for every rep-based exercise in the session in ONE
// batched call (see coachingLoader for the once-only / no-retry-storm rules).
export function useExerciseCoaching(
  exercisesWithSets: ExerciseWithSets[],
  getExerciseId: (ex: ExerciseWithSets) => number,
  getExerciseNotes: (exerciseId: number) => Promise<ExerciseNote[]>,
): Map<number, AIExerciseCoachingResponse> {
  const weightUnit = useWeightUnit();
  const [exerciseCoaching, setExerciseCoaching] = useState<
    Map<number, AIExerciseCoachingResponse>
  >(new Map());

  // Latest callbacks via refs so a new function identity on re-render never
  // re-triggers the effect (the old per-exercise retry storm).
  const getNotesRef = useRef(getExerciseNotes);
  getNotesRef.current = getExerciseNotes;
  const mountedRef = useRef(true);
  const loaderRef = useRef<{
    unit: WeightUnit;
    loader: ReturnType<typeof createCoachingLoader>;
  } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!getAICapability().available || exercisesWithSets.length === 0) return;

    // One loader per session screen (and unit). The ref survives StrictMode's
    // simulated unmount/remount, so the double effect is a no-op.
    if (!loaderRef.current || loaderRef.current.unit !== weightUnit) {
      const unit = weightUnit;
      loaderRef.current = {
        unit,
        loader: createCoachingLoader({
          loadContext: async (exerciseId) => {
            const db = await getDB();
            const [recentSessions, notes] = await Promise.all([
              exerciseSessions(db, exerciseId, {
                completedWorkoutsOnly: true,
                limit: 5,
              }),
              getNotesRef.current(exerciseId),
            ]);
            // Chronological {date, sets}[] for the coaching API.
            const history = recentSessions
              .map(({ date, sets }) => ({ date, sets }))
              .reverse();
            return { history, notes };
          },
          fetchCoaching: (requests) => getSessionCoaching(requests, unit),
          onResult: (coaching) => {
            if (!mountedRef.current) return;
            setExerciseCoaching((prev) => {
              const next = new Map(prev);
              for (const [id, c] of coaching) next.set(id, c);
              return next;
            });
          },
        }),
      };
    }

    const candidates: CoachingCandidate[] = exercisesWithSets
      .filter(
        (ex) =>
          ex.exerciseType !== 'duration' &&
          ex.exerciseType !== 'duration_weight',
      )
      .map((ex) => ({
        exerciseId: getExerciseId(ex),
        exerciseName: ex.exercise.name,
        targetRepMin: ex.workoutLogExercise.target_rep_min ?? 8,
        targetRepMax: ex.workoutLogExercise.target_rep_max ?? 12,
        targetSets: ex.workoutLogExercise.target_sets ?? 3,
      }));

    void loaderRef.current.loader.request(candidates);
  }, [exercisesWithSets, getExerciseId, weightUnit]);

  return exerciseCoaching;
}
