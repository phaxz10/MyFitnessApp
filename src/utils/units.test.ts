import { describe, expect, it } from 'vitest';
import {
  formatWeight,
  fromInputWeight,
  KG_PER_LB,
  parseWeightInput,
  toDisplayWeight,
  unitLabel,
  weightText,
} from './units';

describe('units', () => {
  it('labels units', () => {
    expect(unitLabel('kg')).toBe('kg');
    expect(unitLabel('lbs')).toBe('lbs');
  });

  it('displays kg lifts to the nearest 0.5', () => {
    expect(toDisplayWeight(61.23, 'kg', 'lift')).toBe(61);
    expect(toDisplayWeight(61.3, 'kg', 'lift')).toBe(61.5);
  });

  it('displays lbs lifts to the nearest 0.5', () => {
    expect(toDisplayWeight(100, 'lbs', 'lift')).toBe(220.5);
    expect(toDisplayWeight(20, 'lbs', 'lift')).toBe(44);
  });

  it('displays body weight to 0.1 in either unit', () => {
    expect(toDisplayWeight(82.46, 'kg', 'body')).toBe(82.5);
    expect(toDisplayWeight(82.5, 'lbs', 'body')).toBe(181.9);
  });

  it('displays volume as whole numbers', () => {
    expect(toDisplayWeight(1000, 'kg', 'volume')).toBe(1000);
    expect(toDisplayWeight(1000, 'lbs', 'volume')).toBe(2205);
  });

  it('defaults to lift rounding', () => {
    expect(toDisplayWeight(61.3, 'kg')).toBe(61.5);
  });

  it('converts entered values to kg', () => {
    expect(fromInputWeight(80, 'kg')).toBe(80);
    expect(fromInputWeight(135, 'lbs')).toBeCloseTo(135 * KG_PER_LB, 10);
  });

  it('round-trips an entered lbs lift to the same displayed number', () => {
    for (const lbs of [45, 95, 135, 137.5, 225, 315, 405]) {
      expect(toDisplayWeight(fromInputWeight(lbs, 'lbs'), 'lbs', 'lift')).toBe(
        lbs,
      );
    }
  });

  it('round-trips through float4 (Postgres REAL) storage', () => {
    for (const lbs of [45, 135, 137.5, 225, 405]) {
      const stored = Math.fround(fromInputWeight(lbs, 'lbs'));
      expect(toDisplayWeight(stored, 'lbs', 'lift')).toBe(lbs);
    }
  });

  it('formats with the unit label', () => {
    expect(formatWeight(100, 'lbs', 'lift')).toBe('220.5 lbs');
    expect(formatWeight(82.46, 'kg', 'body')).toBe('82.5 kg');
    expect(formatWeight(80, 'kg', 'body')).toBe('80.0 kg');
  });

  describe('parseWeightInput', () => {
    it('keeps the stored kg exactly when the shown text is untouched', () => {
      // 100 kg shows as 220.5 lbs; completing without edits must not
      // round-trip the display rounding back into storage.
      const shown = String(toDisplayWeight(100, 'lbs', 'lift'));
      expect(parseWeightInput(shown, 'lbs', 100)).toBe(100);
      expect(parseWeightInput('61', 'kg', 61.23)).toBe(61.23);
    });

    it('converts an edited value from the display unit', () => {
      expect(parseWeightInput('225', 'lbs', 100)).toBeCloseTo(
        225 * KG_PER_LB,
        10,
      );
      expect(parseWeightInput('82.5', 'kg', null)).toBe(82.5);
    });

    it('keeps an unedited body weight exact (0.1 rounding)', () => {
      const shown = weightText(82.46, 'lbs', 'body');
      expect(parseWeightInput(shown, 'lbs', 82.46, 'body')).toBe(82.46);
    });

    it('treats empty or invalid text as 0', () => {
      expect(parseWeightInput('', 'lbs', 100)).toBe(0);
      expect(parseWeightInput('abc', 'kg', null)).toBe(0);
      expect(parseWeightInput(undefined, 'kg', null)).toBe(0);
    });
  });
});
