import { describe, expect, it } from 'vitest';
import { resolveSetValues, type SetCells } from './setValues';

const untouched: SetCells = {
  reps: '',
  weight: '',
  durationSeconds: '',
  placeholderReps: '8',
  placeholderWeight: '60',
};

describe('resolveSetValues: tapping Done', () => {
  it('fills an untouched set from the placeholders it shows', () => {
    const { values } = resolveSetValues(untouched, 'reps_weight', 'kg', {
      fillPlaceholders: true,
    });
    expect(values).toEqual({ reps: 8, weight_kg: 60, duration_seconds: null });
  });

  it('returns the filled cells so the UI shows them as real values', () => {
    const { cells } = resolveSetValues(untouched, 'reps_weight', 'kg', {
      fillPlaceholders: true,
    });
    expect(cells).toMatchObject({ reps: '8', weight: '60' });
  });

  it('fills only the fields left empty', () => {
    const { values } = resolveSetValues(
      { ...untouched, reps: '10' },
      'reps_weight',
      'kg',
      { fillPlaceholders: true },
    );
    expect(values).toEqual({ reps: 10, weight_kg: 60, duration_seconds: null });
  });

  it('converts a lbs placeholder to kg', () => {
    const { values } = resolveSetValues(
      { ...untouched, placeholderWeight: '135' },
      'reps_weight',
      'lbs',
      { fillPlaceholders: true },
    );
    expect(values.weight_kg).toBeCloseTo(61.235, 3);
  });

  it('stores an empty weight with no placeholder as NULL, not 0', () => {
    const { values } = resolveSetValues(
      { reps: '12', weight: '', durationSeconds: '' },
      'reps_weight',
      'kg',
      { fillPlaceholders: true },
    );
    expect(values.weight_kg).toBeNull();
  });

  it('stores no weight for a reps-only exercise', () => {
    const { values } = resolveSetValues(
      { ...untouched, placeholderWeight: '0' },
      'reps_only',
      'kg',
      { fillPlaceholders: true },
    );
    expect(values).toEqual({
      reps: 8,
      weight_kg: null,
      duration_seconds: null,
    });
  });

  it('fills a duration set from its duration placeholder', () => {
    const { values } = resolveSetValues(
      { reps: '', weight: '', durationSeconds: '', placeholderDuration: '45' },
      'duration',
      'kg',
      { fillPlaceholders: true },
    );
    expect(values).toEqual({
      reps: null,
      weight_kg: null,
      duration_seconds: 45,
    });
  });
});

describe('resolveSetValues: auto-save while typing', () => {
  it('saves only what was typed; placeholders stay suggestions', () => {
    const { values } = resolveSetValues(
      { ...untouched, reps: '10' },
      'reps_weight',
      'kg',
      { fillPlaceholders: false },
    );
    expect(values).toEqual({
      reps: 10,
      weight_kg: null,
      duration_seconds: null,
    });
  });

  it('keeps an unedited stored kg value exact', () => {
    const { values } = resolveSetValues(
      { reps: '5', weight: '220.5', weightKg: 100, durationSeconds: '' },
      'reps_weight',
      'lbs',
      { fillPlaceholders: false },
    );
    expect(values.weight_kg).toBe(100);
  });
});
