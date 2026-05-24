import { Copy } from 'lucide-react';
import type { DailyCalorieSummary, UserProfile } from '../../types';
import { MACRO_PALETTE, NutritionRings } from './NutritionRings';

export interface DailySummaryCardProps {
  summary: DailyCalorieSummary;
  profile: UserProfile | null;
  onCopyPreviousDay: () => void;
  copyLoading: boolean;
}

export function DailySummaryCard({
  summary,
  profile,
  onCopyPreviousDay,
  copyLoading,
}: DailySummaryCardProps) {
  const targets = {
    calories: profile?.calorie_target ?? 0,
    protein: profile?.protein_target_g ?? 0,
    carbs: profile?.carbs_target_g ?? 0,
    fat: profile?.fat_target_g ?? 0,
  };
  const consumed = {
    calories: summary.total_calories,
    protein: summary.total_protein_g,
    carbs: summary.total_carbs_g,
    fat: summary.total_fat_g,
  };

  return (
    <div className="bg-slate-800/80 rounded-3xl p-6 mb-4 backdrop-blur">
      <div className="flex items-center gap-6">
        <NutritionRings consumed={consumed} targets={targets} />
        <div className="flex-1 space-y-2">
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
            suffix="kcal"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onCopyPreviousDay}
        disabled={copyLoading}
        className="mt-5 w-full py-2.5 rounded-full text-xs font-semibold tracking-wide text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
      >
        <Copy size={14} />
        COPY YESTERDAY
      </button>
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
      <span className="text-[10px] uppercase tracking-widest text-slate-500 w-12">
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
