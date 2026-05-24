import { describe, expect, it } from 'vitest';
import { normalizeProgramResponse } from './programCoach';

const baseRawSession = {
  name: 'Push Day',
  dayOfWeek: 1,
  exercises: [
    {
      name: 'Bench Press',
      targetSets: 3,
      targetRepMin: 6,
      targetRepMax: 10,
      targetDurationSeconds: null,
      notes: null,
      supersetWith: null,
    },
  ],
};

describe('normalizeProgramResponse', () => {
  it('flattens muscleGroupBreakdown array into a Record<string, number>', () => {
    const result = normalizeProgramResponse({
      programName: 'P',
      programDescription: 'D',
      sessions: [baseRawSession],
      weeklyVolumeSummary: {
        totalSets: 30,
        muscleGroupBreakdown: [
          { muscleGroup: 'Chest', sets: 12 },
          { muscleGroup: 'Back', sets: 14 },
          { muscleGroup: 'Shoulders', sets: 4 },
        ],
      },
      recommendations: [],
      experienceLevel: null,
    });
    expect(result.weeklyVolumeSummary.muscleGroupBreakdown).toEqual({
      Chest: 12,
      Back: 14,
      Shoulders: 4,
    });
    expect(result.weeklyVolumeSummary.totalSets).toBe(30);
  });

  it('sums sets when the AI emits the same muscle group twice', () => {
    // Defensive: nothing in the schema prevents the AI from listing the same
    // muscle group across multiple entries (e.g. "Chest" + "Upper Chest"
    // separately, or just a duplicate). Sum rather than overwrite.
    const result = normalizeProgramResponse({
      programName: 'P',
      programDescription: 'D',
      sessions: [baseRawSession],
      weeklyVolumeSummary: {
        totalSets: 20,
        muscleGroupBreakdown: [
          { muscleGroup: 'Chest', sets: 6 },
          { muscleGroup: 'Chest', sets: 6 },
        ],
      },
      recommendations: [],
      experienceLevel: null,
    });
    expect(result.weeklyVolumeSummary.muscleGroupBreakdown).toEqual({
      Chest: 12,
    });
  });

  it('trims whitespace from muscle group names and drops empties', () => {
    const result = normalizeProgramResponse({
      programName: 'P',
      programDescription: 'D',
      sessions: [baseRawSession],
      weeklyVolumeSummary: {
        totalSets: 10,
        muscleGroupBreakdown: [
          { muscleGroup: '  Back  ', sets: 10 },
          { muscleGroup: '', sets: 99 },
          { muscleGroup: '   ', sets: 50 },
        ],
      },
      recommendations: [],
      experienceLevel: null,
    });
    expect(result.weeklyVolumeSummary.muscleGroupBreakdown).toEqual({
      Back: 10,
    });
  });

  it('coerces nullable optional fields to undefined for the public type', () => {
    const result = normalizeProgramResponse({
      programName: 'P',
      programDescription: 'D',
      sessions: [
        {
          name: 'Day 1',
          dayOfWeek: null,
          exercises: [
            {
              name: 'Plank',
              targetSets: 3,
              targetRepMin: 0,
              targetRepMax: 0,
              targetDurationSeconds: 60,
              notes: 'hold tight core',
              supersetWith: null,
            },
          ],
        },
      ],
      weeklyVolumeSummary: { totalSets: 0, muscleGroupBreakdown: [] },
      recommendations: [],
      experienceLevel: null,
    });
    expect(result.sessions[0].exercises[0].supersetWith).toBeUndefined();
    expect(result.sessions[0].exercises[0].targetDurationSeconds).toBe(60);
    expect(result.experienceLevel).toBeUndefined();
  });
});
