import { useCallback, useEffect, useState } from 'react';
import type { ExerciseWithSets } from '../../hooks/useWorkoutSession';
import { getAICapability } from '../../services/ai/useAICapability';
import { getExerciseCoaching } from '../../services/coaching/workoutCoach';
import { getDB } from '../../services/db';
import { sessions as exerciseSessions } from '../../services/queries/exerciseHistory';
import type { AIExerciseCoachingResponse, ExerciseNote } from '../../types';

// Moved out of WorkoutSession unchanged: fetches one AI coaching response per
// rep-based exercise in the session, once, when an AI key is configured.
export function useExerciseCoaching(
  exercisesWithSets: ExerciseWithSets[],
  getExerciseId: (ex: ExerciseWithSets) => number,
  getExerciseNotes: (exerciseId: number) => Promise<ExerciseNote[]>,
): Map<number, AIExerciseCoachingResponse> {
  // AI coaching state
  const [exerciseCoaching, setExerciseCoaching] = useState<
    Map<number, AIExerciseCoachingResponse>
  >(new Map());
  const [coachingLoading, setCoachingLoading] = useState<Set<number>>(
    new Set(),
  );

  // Fetch AI coaching for exercises
  const fetchExerciseCoaching = useCallback(
    async (
      exerciseId: number,
      exerciseName: string,
      targetRepMin: number,
      targetRepMax: number,
      targetSets: number,
    ) => {
      if (!getAICapability().available) return;
      if (coachingLoading.has(exerciseId)) return;
      if (exerciseCoaching.has(exerciseId)) return;

      setCoachingLoading((prev) => new Set(prev).add(exerciseId));

      try {
        const db = await getDB();
        const [recentSessions, notes] = await Promise.all([
          exerciseSessions(db, exerciseId, {
            completedWorkoutsOnly: true,
            limit: 5,
          }),
          getExerciseNotes(exerciseId),
        ]);
        // Adapter: convert to chronological {date, sets}[] for the coaching API
        const history = recentSessions
          .map(({ date, sets }) => ({ date, sets }))
          .reverse();

        if (history.length === 0) {
          setCoachingLoading((prev) => {
            const next = new Set(prev);
            next.delete(exerciseId);
            return next;
          });
          return;
        }

        const coaching = await getExerciseCoaching(
          exerciseName,
          history,
          targetRepMin,
          targetRepMax,
          targetSets,
          notes,
        );
        coaching.exerciseId = exerciseId;
        setExerciseCoaching((prev) => new Map(prev).set(exerciseId, coaching));
      } catch (err) {
        console.error('Failed to fetch exercise coaching:', err);
      } finally {
        setCoachingLoading((prev) => {
          const next = new Set(prev);
          next.delete(exerciseId);
          return next;
        });
      }
    },
    [coachingLoading, exerciseCoaching, getExerciseNotes],
  );

  // Fetch coaching when exercises load
  useEffect(() => {
    if (!getAICapability().available || exercisesWithSets.length === 0) return;

    exercisesWithSets.forEach((ex) => {
      const exerciseId = getExerciseId(ex);
      const exerciseName = ex.exercise.name;

      if (
        ex.exerciseType === 'duration' ||
        ex.exerciseType === 'duration_weight'
      )
        return;

      const targetRepMin = ex.workoutLogExercise.target_rep_min ?? 8;
      const targetRepMax = ex.workoutLogExercise.target_rep_max ?? 12;
      const targetSets = ex.workoutLogExercise.target_sets ?? 3;

      fetchExerciseCoaching(
        exerciseId,
        exerciseName,
        targetRepMin,
        targetRepMax,
        targetSets,
      );
    });
  }, [exercisesWithSets, fetchExerciseCoaching, getExerciseId]);

  return exerciseCoaching;
}
