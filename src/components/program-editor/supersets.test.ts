import { describe, expect, it } from 'vitest';
import type { ExerciseFormData } from './schema';
import { deleteExercise, linkExercises, normalizeSupersets } from './supersets';

function ex(
  name: string,
  supersetGroupId: string | null = null,
  targetSets = 3,
): ExerciseFormData {
  return {
    exerciseId: name.charCodeAt(0),
    exerciseName: name,
    exerciseType: 'reps_weight',
    targetSets,
    targetRepMin: 8,
    targetRepMax: 12,
    targetDurationSeconds: null,
    supersetGroupId,
    notes: '',
  };
}

let n = 0;
const newId = () => `ss-new-${++n}`;
const groups = (list: ExerciseFormData[]) =>
  list.map((e) => `${e.exerciseName}:${e.supersetGroupId ?? '-'}`);

describe('linkExercises', () => {
  it('links two loose exercises into a new superset sharing set count', () => {
    const next = linkExercises([ex('A', null, 4), ex('B')], 0, 1, () => 'ss-x');
    expect(groups(next)).toEqual(['A:ss-x', 'B:ss-x']);
    expect(next.map((e) => e.targetSets)).toEqual([4, 4]);
  });

  it('joins an existing superset when linking to one of its members (3+)', () => {
    const start = [ex('A', 'ss-1', 4), ex('B', 'ss-1', 4), ex('C')];
    const next = linkExercises(start, 1, 2, newId);
    expect(groups(next)).toEqual(['A:ss-1', 'B:ss-1', 'C:ss-1']);
    expect(next.map((e) => e.targetSets)).toEqual([4, 4, 4]);
  });

  it('joins when the loose exercise is tapped first', () => {
    const start = [ex('A', 'ss-1'), ex('B', 'ss-1'), ex('C')];
    const next = linkExercises(start, 2, 0, newId);
    expect(groups(next)).toEqual(['A:ss-1', 'B:ss-1', 'C:ss-1']);
  });

  it('merges two supersets into one', () => {
    const start = [
      ex('A', 'ss-1'),
      ex('B', 'ss-1'),
      ex('C', 'ss-2'),
      ex('D', 'ss-2'),
    ];
    const next = linkExercises(start, 0, 3, newId);
    expect(new Set(next.map((e) => e.supersetGroupId))).toEqual(
      new Set(['ss-1']),
    );
  });
});

describe('deleteExercise', () => {
  it('never leaves a one-member superset behind', () => {
    const next = deleteExercise([ex('A', 'ss-1'), ex('B', 'ss-1'), ex('C')], 1);
    expect(groups(next)).toEqual(['A:-', 'C:-']);
  });

  it('keeps a superset that still has two members', () => {
    const start = [ex('A', 'ss-1'), ex('B', 'ss-1'), ex('C', 'ss-1')];
    expect(groups(deleteExercise(start, 0))).toEqual(['B:ss-1', 'C:ss-1']);
  });
});

describe('normalizeSupersets (on save)', () => {
  it('moves members next to the first one, keeping everything else in order', () => {
    const start = [ex('A', 'ss-1'), ex('X'), ex('B', 'ss-1'), ex('Y')];
    expect(groups(normalizeSupersets(start))).toEqual([
      'A:ss-1',
      'B:ss-1',
      'X:-',
      'Y:-',
    ]);
  });

  it('clears a group id that only one exercise carries', () => {
    expect(groups(normalizeSupersets([ex('A', 'ss-1'), ex('B')]))).toEqual([
      'A:-',
      'B:-',
    ]);
  });
});
