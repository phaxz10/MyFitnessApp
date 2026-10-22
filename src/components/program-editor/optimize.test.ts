import { describe, expect, it } from 'vitest';
import type { AIProgramGeneratorResponse, Exercise } from '../../types';
import {
  appendFilledExercises,
  applyOptimizationResult,
  programExerciseRequests,
} from './optimize';
import type { ExerciseFormData } from './schema';

const exercise = (
  id: number,
  name: string,
  type: Exercise['exercise_type'] = 'reps_weight',
): Exercise => ({
  id,
  name,
  description: '',
  muscle_groups: '',
  equipment: '',
  video_url: null,
  exercise_type: type,
  is_ai_generated: false,
  created_at: '',
});

const target = (name: string, supersetWith?: string) => ({
  name,
  targetSets: 3,
  targetRepMin: 8,
  targetRepMax: 12,
  supersetWith,
});

const result: AIProgramGeneratorResponse = {
  programName: 'Home Upper Lower',
  programDescription: 'Dumbbells and a bench',
  sessions: [
    {
      name: 'Upper',
      dayOfWeek: 1,
      exercises: [
        target('Dumbbell Bench Press'),
        target('Dumbbell Curl', 'Overhead Triceps Extension'),
        target('Overhead Triceps Extension', 'Dumbbell Curl'),
      ],
    },
    { name: 'Lower', dayOfWeek: null, exercises: [target('Plank')] },
  ],
  weeklyVolumeSummary: { totalSets: 12, muscleGroupBreakdown: {} },
  recommendations: [],
};

const resolved = new Map([
  ['dumbbell bench press', exercise(1, 'Dumbbell Bench Press')],
  ['dumbbell curl', exercise(2, 'Dumbbell Curl')],
  ['overhead triceps extension', exercise(3, 'Overhead Triceps Extension')],
  ['plank', exercise(4, 'Plank', 'duration')],
]);

describe('applyOptimizationResult', () => {
  it('keeps every exercise the AI returned when the resolver mapped it', () => {
    const form = applyOptimizationResult(result, resolved);
    expect(form.name).toBe('Home Upper Lower');
    expect(
      form.sessions.map((s) => s.exercises.map((e) => e.exerciseId)),
    ).toEqual([[1, 2, 3], [4]]);
  });

  it('pairs supersets and uses timed targets for duration exercises', () => {
    const [upper, lower] = applyOptimizationResult(result, resolved).sessions;
    expect(upper.exercises[1].supersetGroupId).toBeTruthy();
    expect(upper.exercises[1].supersetGroupId).toBe(
      upper.exercises[2].supersetGroupId,
    );
    expect(lower.exercises[0]).toMatchObject({
      targetRepMin: null,
      targetDurationSeconds: 30,
    });
  });

  it('lists every program exercise for the resolver, with known details', () => {
    const requests = programExerciseRequests(result, [
      {
        name: 'plank',
        description: 'Hold',
        muscle_groups: ['Core'],
        equipment: 'Bodyweight',
        tips: [],
        exercise_type: 'duration',
      },
    ]);
    expect(requests.map((r) => r.name)).toHaveLength(4);
    expect(requests[3].details?.description).toBe('Hold');
  });
});

describe('appendFilledExercises', () => {
  const inSession: ExerciseFormData[] = applyOptimizationResult(
    result,
    resolved,
  ).sessions[0].exercises;

  it('appends new suggestions and skips ones already in the session', () => {
    const next = appendFilledExercises(
      inSession,
      [
        {
          ...target(' dumbbell  BENCH press'),
          targetDurationSeconds: null,
          notes: null,
        },
        { ...target('Plank'), targetDurationSeconds: 45, notes: null },
        { ...target('plank'), targetDurationSeconds: 45, notes: null },
      ],
      resolved,
    );
    expect(next.map((e) => e.exerciseName)).toEqual([
      'Dumbbell Bench Press',
      'Dumbbell Curl',
      'Overhead Triceps Extension',
      'Plank',
    ]);
    expect(next[3].targetDurationSeconds).toBe(45);
  });
});
