// Color-dot + label + "consumed / target" rows for the four macros.
// Pairs with NutritionRings — same MACRO_PALETTE colors, same row order.
//
// Used on every nutrition surface (CalorieLog daily summary, Dashboard card,
// WeeklyReviewModal summary step). Keeping this as a single component avoids
// the previous duplication where each surface had its own near-identical
// MacroLegendRow / DashboardMacroLine helper.
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
}

export function MacroLegend({ consumed, targets }: MacroLegendProps) {
  return (
    <div className="space-y-2">
      <MacroLegendRow
        label="Protein"
        consumed={consumed.protein}
        target={targets.protein}
        color={MACRO_PALETTE.protein.text}
        dot={MACRO_PALETTE.protein.hex}
      />
      <MacroLegendRow
        label="Carbs"
        consumed={consumed.carbs}
        target={targets.carbs}
        color={MACRO_PALETTE.carbs.text}
        dot={MACRO_PALETTE.carbs.hex}
      />
      <MacroLegendRow
        label="Fat"
        consumed={consumed.fat}
        target={targets.fat}
        color={MACRO_PALETTE.fat.text}
        dot={MACRO_PALETTE.fat.hex}
      />
      <MacroLegendRow
        label="Calories"
        consumed={consumed.calories}
        target={targets.calories}
        color={MACRO_PALETTE.calories.text}
        dot={MACRO_PALETTE.calories.hex}
        suffix=""
      />
    </div>
  );
}

interface MacroLegendRowProps {
  label: string;
  consumed: number;
  target: number;
  color: string;
  dot: string;
  suffix?: string;
}

function MacroLegendRow({
  label,
  consumed,
  target,
  color,
  dot,
  suffix = 'g',
}: MacroLegendRowProps) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: dot }}
      />
      <span className="text-[10px] uppercase tracking-widest text-slate-500 w-20 flex-shrink-0">
        {label}
      </span>
      <span className={`text-xs tabular-nums font-semibold ${color}`}>
        {Math.round(consumed)}
      </span>
      <span className="text-xs text-slate-600 tabular-nums">
        / {Math.round(target)}
        {suffix}
      </span>
    </div>
  );
}
