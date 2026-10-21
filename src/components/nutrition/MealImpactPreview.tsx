// Shows where the day's totals will land *after* saving the meal being
// previewed in the AI entry adapters, using the same ruled macro bars as the
// daily summary.
import type { DailyCalorieSummary } from '../../types';
import { MacroLegend } from './MacroLegend';

// Adapter from the DB-shape summary to the Macros shape expected by
// MealImpactPreview. Lives here so meal-entry adapters don't need to know
// the internal Macros interface.
export function mapSummaryToMacros(summary: DailyCalorieSummary): {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
} {
  return {
    calories: summary.total_calories,
    protein: summary.total_protein_g,
    carbs: summary.total_carbs_g,
    fat: summary.total_fat_g,
  };
}

interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealImpactPreviewProps {
  meal: Macros; // totals for the meal about to be saved
  todayBefore: Macros; // already-logged totals for the same date
  targets: Macros;
}

export function MealImpactPreview({
  meal,
  todayBefore,
  targets,
}: MealImpactPreviewProps) {
  const after: Macros = {
    calories: todayBefore.calories + meal.calories,
    protein: todayBefore.protein + meal.protein,
    carbs: todayBefore.carbs + meal.carbs,
    fat: todayBefore.fat + meal.fat,
  };

  return (
    <div className="rounded-xl border border-line p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-ink-2">
          Day total after this meal
        </p>
        <p className="num text-sm text-ink-3">
          <span className="text-2xl font-bold text-ink">
            {Math.round(after.calories).toLocaleString()}
          </span>{' '}
          / {Math.round(targets.calories).toLocaleString()} kcal
        </p>
      </div>
      <p className="num text-sm text-ink-2">
        <span className="font-bold text-ink">+{Math.round(meal.calories)}</span>{' '}
        kcal this meal
      </p>
      <MacroLegend consumed={after} targets={targets} showCalories={false} />
    </div>
  );
}
