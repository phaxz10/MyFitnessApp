// Shows where the day's totals will land *after* saving the meal being
// previewed in the AI entry adapters. Rings reuse the daily NutritionRings
// component so the visual language matches the CalorieLog dashboard exactly:
// the user is staring at the same rings they'll see post-save.
import type { DailyCalorieSummary } from '../../types';
import { NutritionRings } from './NutritionRings';

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
    <div className="bg-slate-800/80 rounded-2xl p-4 flex items-center gap-4">
      <NutritionRings
        consumed={after}
        targets={targets}
        size={112}
        title="Day total after this meal"
        center={
          <>
            <p className="text-xl font-black text-white tabular-nums leading-none">
              {Math.round(after.calories).toLocaleString()}
            </p>
            <p className="text-[9px] text-slate-400 uppercase tracking-wider mt-1">
              of {Math.round(targets.calories).toLocaleString()}
            </p>
          </>
        }
      />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500 mb-2">
          After saving
        </p>
        <p className="text-sm text-white mb-3 tabular-nums">
          <span className="text-rose-400 font-semibold">
            +{Math.round(meal.calories)}
          </span>{' '}
          kcal this meal
        </p>
        <div className="space-y-1 text-[11px] tabular-nums">
          <DeltaLine
            label="P"
            color="text-amber-300"
            before={todayBefore.protein}
            meal={meal.protein}
            target={targets.protein}
          />
          <DeltaLine
            label="C"
            color="text-cyan-400"
            before={todayBefore.carbs}
            meal={meal.carbs}
            target={targets.carbs}
          />
          <DeltaLine
            label="F"
            color="text-violet-400"
            before={todayBefore.fat}
            meal={meal.fat}
            target={targets.fat}
          />
        </div>
      </div>
    </div>
  );
}

interface DeltaLineProps {
  label: string;
  color: string;
  before: number;
  meal: number;
  target: number;
}

function DeltaLine({ label, color, before, meal, target }: DeltaLineProps) {
  const after = before + meal;
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`font-bold w-3 ${color}`}>{label}</span>
      <span className="text-white font-medium">{Math.round(after)}</span>
      <span className={color}>+{Math.round(meal)}</span>
      <span className="text-slate-600">/ {Math.round(target)}g</span>
    </div>
  );
}
