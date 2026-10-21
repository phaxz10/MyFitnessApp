import type { AIFoodItem, MealType } from '../../types';
import { recalculateMacros } from '../../utils/calculations';

export interface EditableFoodItem extends AIFoodItem {
  originalPortion: number;
  // Stable client-side ID assigned when the AI response lands. Used as React
  // list key: names can repeat ("egg", "egg") and array indices shift when
  // the user removes an item, both of which would break key stability.
  id: string;
}

export function toEditableItems(items: AIFoodItem[]): EditableFoodItem[] {
  return items.map((item) => ({
    ...item,
    originalPortion: item.portion_grams,
    id: crypto.randomUUID(),
  }));
}

export function withPortion(
  item: EditableFoodItem,
  newPortion: number,
): EditableFoodItem {
  const ratio = item.originalPortion / item.portion_grams;
  const recalculated = recalculateMacros(item.originalPortion, newPortion, {
    calories: item.calories * ratio,
    protein_g: item.protein_g * ratio,
    carbs_g: item.carbs_g * ratio,
    fat_g: item.fat_g * ratio,
  });
  return { ...item, portion_grams: newPortion, ...recalculated };
}

export function sumItems(items: EditableFoodItem[]) {
  return items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein_g,
      carbs: acc.carbs + item.carbs_g,
      fat: acc.fat + item.fat_g,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function defaultMealTypeForNow(): MealType {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 10) return 'breakfast';
  if (hour >= 11 && hour < 14) return 'lunch';
  if (hour >= 17 && hour < 21) return 'dinner';
  return 'snack';
}
