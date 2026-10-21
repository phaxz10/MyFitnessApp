import type { AIWeeklyReviewResponse } from '../../types';

export type ReviewStep =
  | 'loading'
  | 'summary'
  | 'measurements'
  | 'targets'
  | 'goal'
  | 'complete';

export interface MeasurementsFormState {
  weight: string;
  waist: string;
  neck: string;
  arm: string;
}

export interface TargetsFormState {
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type AppliedRecommendations = Record<
  'measurements' | 'targets' | 'goal',
  boolean
>;

export type Recommendations = AIWeeklyReviewResponse['recommendations'];

export const GOAL_OPTIONS = [
  'bulk',
  'lean_bulk',
  'recomp',
  'cut',
  'maintain',
] as const;

// "lean_bulk" -> "lean bulk"
export const goalLabel = (goal: string) => goal.replace('_', ' ');
