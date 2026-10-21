import { describe, expect, it } from 'vitest';
import { movementPatternFor } from './MovementPictogram';

describe('movementPatternFor', () => {
  it.each([
    ['Bulgarian Split Squat', 'lunge'],
    ['Goblet Squat', 'squat'],
    ['Leg Extension', 'squat'],
    ['Lying Leg Curl', 'hinge'],
    ['Romanian Deadlift', 'hinge'],
    ['Dumbbell Bench Press', 'push'],
    ['Seated Overhead Press', 'press'],
    ['Chin-up', 'pull'],
    ['One-Arm Dumbbell Row', 'row'],
    ['Hammer Curl', 'arms'],
    ["Farmer's Carry", 'carry'],
    ['Plank', 'core'],
  ])('%s -> %s', (name, pattern) => {
    expect(movementPatternFor(name)).toBe(pattern);
  });

  it('falls back to muscle groups, then general', () => {
    expect(movementPatternFor('Mystery Move', 'Chest, Triceps')).toBe('push');
    expect(movementPatternFor('Mystery Move', ['Hamstrings'])).toBe('hinge');
    expect(movementPatternFor('Mystery Move')).toBe('general');
  });
});
