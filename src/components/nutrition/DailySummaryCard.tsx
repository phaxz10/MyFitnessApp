import { Copy } from 'lucide-react';
import type { DailyCalorieSummary, UserProfile } from '../../types';
import { MacroLegend } from './MacroLegend';
import { NutritionRings } from './NutritionRings';

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
      <div className="flex items-center gap-4">
        <NutritionRings consumed={consumed} targets={targets} size={144} />
        <div className="flex-1">
          <MacroLegend consumed={consumed} targets={targets} />
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
