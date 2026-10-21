import { describe, expect, it } from 'vitest';
import type { WorkoutLogExerciseWithDetails } from '../types';
import {
  type ExerciseWithSets,
  patchSet,
  removeExercises,
  removeSets,
  type SetData,
} from './workoutSessionState';

function set(id: number, n: number): SetData {
  return {
    id,
    set_number: n,
    reps: '',
    weight: '',
    durationSeconds: '',
    completed: false,
  };
}

function exercise(id: number, setIds: number[]): ExerciseWithSets {
  return {
    workoutLogExercise: { id } as WorkoutLogExerciseWithDetails,
    exercise: { id } as ExerciseWithSets['exercise'],
    exerciseType: 'reps_weight',
    sets: setIds.map((s, i) => set(s, i + 1)),
    lastPerformance: null,
    isExpanded: true,
    notes: '',
  };
}

describe('removeSets', () => {
  // Bug: deleting a set always dropped the last one.
  it('deletes the set that was tapped, not the last one', () => {
    const state = [exercise(1, [11, 12, 13])];
    const next = removeSets(state, [11]);
    expect(next[0].sets.map((s) => s.id)).toEqual([12, 13]);
    expect(next[0].sets.map((s) => s.set_number)).toEqual([1, 2]);
  });

  it('removes a superset round across exercises', () => {
    const state = [exercise(1, [11, 12]), exercise(2, [21, 22])];
    const next = removeSets(state, [12, 22]);
    expect(next.map((e) => e.sets.map((s) => s.id))).toEqual([[11], [21]]);
  });
});

describe('patchSet', () => {
  // Bug: handlers captured an array index, awaited, then wrote updated[index].
  it('updates the right set after an earlier exercise was removed meanwhile', () => {
    const state = [exercise(1, [11]), exercise(2, [21])];
    const tapped = state[1].sets[0].id; // captured before the await
    const afterRemoval = removeExercises(state, [1]);

    const next = patchSet(afterRemoval, tapped, { completed: true });

    expect(next).toHaveLength(1);
    expect(next[0].workoutLogExercise.id).toBe(2);
    expect(next[0].sets[0].completed).toBe(true);
  });

  it('is a no-op when the set no longer exists', () => {
    const state = [exercise(1, [11])];
    expect(patchSet(state, 99, { completed: true })).toEqual(state);
  });
});
