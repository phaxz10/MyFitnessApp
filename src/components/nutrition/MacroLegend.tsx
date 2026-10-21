// Ruled horizontal bars for the macros: label, "consumed / target" in
// condensed numerals, and a flat fill on a hairline track. Same
// MACRO_PALETTE colours as NutritionRings.
//
// Used on every nutrition surface (Dashboard, CalorieLog daily summary,
// MealImpactPreview, WeeklyReviewModal summary step).
import { MACRO_PALETTE } from './NutritionRings';

interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MacroLegendProps {
  consumed: Macros;
  targets: Macros;
  /** Include the calories row. Surfaces that show kcal as a big numeral turn it off. */
  showCalories?: boolean;
}

export function MacroLegend({
  consumed,
  targets,
  showCalories = true,
}: MacroLegendProps) {
  return (
    <div className="divide-y divide-line">
      <MacroBar
        label="Protein"
        consumed={consumed.protein}
        target={targets.protein}
        color={MACRO_PALETTE.protein}
      />
      <MacroBar
        label="Carbs"
        consumed={consumed.carbs}
        target={targets.carbs}
        color={MACRO_PALETTE.carbs}
      />
      <MacroBar
        label="Fat"
        consumed={consumed.fat}
        target={targets.fat}
        color={MACRO_PALETTE.fat}
      />
      {showCalories && (
        <MacroBar
          label="Calories"
          consumed={consumed.calories}
          target={targets.calories}
          color={MACRO_PALETTE.calories}
          unit=""
          warnOver
        />
      )}
    </div>
  );
}

interface MacroBarProps {
  label: string;
  consumed: number;
  target: number;
  color: { hex: string; text: string };
  unit?: string;
  warnOver?: boolean;
}

function MacroBar({
  label,
  consumed,
  target,
  color,
  unit = 'g',
  warnOver = false,
}: MacroBarProps) {
  const pct = target > 0 ? Math.min(consumed / target, 1) * 100 : 0;
  const over = warnOver && target > 0 && consumed > target;

  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-sm font-semibold ${color.text}`}>{label}</span>
        <span className="num text-sm">
          <span
            className={`text-base font-bold ${over ? 'text-danger' : 'text-ink'}`}
          >
            {Math.round(consumed)}
          </span>
          <span className="text-ink-3">
            {' '}
            / {Math.round(target)}
            {unit}
          </span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.round(target)}
        aria-valuenow={Math.round(consumed)}
        className="mt-1.5 h-1.5 rounded-full bg-sunken-strong overflow-hidden"
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color.hex }}
        />
      </div>
    </div>
  );
}
