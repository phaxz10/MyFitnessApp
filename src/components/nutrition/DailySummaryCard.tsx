import { Copy } from 'lucide-react';
import type { DailyCalorieSummary, UserProfile } from '../../types';
import { Button, Card, CardContent } from '../ui';
import { MacroLegend } from './MacroLegend';

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
  const over = targets.calories > 0 && consumed.calories > targets.calories;

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="num leading-none">
            <span
              className={`text-5xl font-bold ${over ? 'text-danger' : 'text-ink'}`}
            >
              {Math.round(consumed.calories).toLocaleString()}
            </span>
            <span className="text-ink-3 text-lg">
              {' '}
              / {Math.round(targets.calories).toLocaleString()} kcal
            </span>
          </p>
        </div>

        <MacroLegend
          consumed={consumed}
          targets={targets}
          showCalories={false}
        />

        <Button
          variant="secondary"
          size="sm"
          onClick={onCopyPreviousDay}
          disabled={copyLoading}
          className="w-full h-11"
        >
          <Copy size={14} aria-hidden="true" />
          Copy yesterday's meals
        </Button>
      </CardContent>
    </Card>
  );
}
