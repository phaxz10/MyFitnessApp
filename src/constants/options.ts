/**
 * Shared option arrays for form selects
 * Consolidates duplicate option definitions across the codebase
 */

import type { MealType } from '../types';

/**
 * Meal type options for food logging
 * Used by: CalorieLog, FoodLogModal, MealScanner
 */
export const mealTypes: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];
