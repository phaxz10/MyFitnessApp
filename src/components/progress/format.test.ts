import { describe, expect, it } from 'vitest';
import {
  formatMaxWeightDetail,
  formatSessionCount,
  oneRMEmptyMessage,
} from './format';

describe('formatMaxWeightDetail', () => {
  it('shows the reps for the max-weight set', () => {
    expect(formatMaxWeightDetail(5)).toBe('5 reps');
    expect(formatMaxWeightDetail(1)).toBe('1 rep');
  });

  // Regression: the max-weight query keeps sets with NULL reps, which the
  // card rendered as the literal "null reps".
  it('never renders "null reps" when reps were not logged', () => {
    expect(formatMaxWeightDetail(null)).toBe('Reps not logged');
    expect(formatMaxWeightDetail(0)).toBe('Reps not logged');
  });
});

describe('oneRMEmptyMessage', () => {
  it('says nothing is logged only when there are no sessions', () => {
    expect(oneRMEmptyMessage(0, 0)).toBe(
      'No sessions logged for this exercise in this range.',
    );
  });

  // Regression: a session whose sets lack reps has no estimated 1RM, so the
  // chart claimed "No sessions logged" while the header said "1 sessions".
  it('explains a missing 1RM when sessions exist but none can be plotted', () => {
    expect(oneRMEmptyMessage(1, 0)).toBe(
      'Log weight and reps on a set to estimate your 1RM.',
    );
  });

  it('asks for one more session when only one point exists', () => {
    expect(oneRMEmptyMessage(1, 1)).toBe(
      'Need one more session to show a trend.',
    );
  });
});

describe('formatSessionCount', () => {
  it('pluralises', () => {
    expect(formatSessionCount(1)).toBe('1 session');
    expect(formatSessionCount(3)).toBe('3 sessions');
  });
});
