/**
 * Shared option arrays for form selects
 * Consolidates duplicate option definitions across the codebase
 */

import type { DietType, MealType } from '../types';

/**
 * Meal type options for food logging
 * Used by: CalorieLog, MealEntryShell (and its adapters)
 */
export const mealTypes: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

/**
 * Diet type (carb strategy) options for macro targets — see ADR-0006.
 * `description` is the carb range each tier targets, shown as helper text in
 * onboarding/settings. Used by: Onboarding (goal step), Settings (goals form).
 */
export const dietTypeOptions: {
  value: DietType;
  label: string;
  description: string;
}[] = [
  {
    value: 'balanced',
    label: 'Balanced',
    description: 'Higher carb — fills remaining calories (app default)',
  },
  {
    value: 'moderate',
    label: 'Moderate carb',
    description: '~35% of calories from carbs',
  },
  {
    value: 'low_carb',
    label: 'Low carb',
    description: '~100g/day — strong insulin reduction',
  },
  {
    value: 'keto',
    label: 'Keto',
    description: '~25g/day — ketosis-inducing (therapeutic)',
  },
];
