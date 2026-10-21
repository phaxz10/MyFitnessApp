import { Dumbbell, Scale, Target } from 'lucide-react';
import type { ReactNode } from 'react';
import type { UserProfile, WeeklyReviewData } from '../../types';
import { formatDisplayDate } from '../../utils/date';
import { MacroLegend, NutritionRings } from '../nutrition';
import type { Macros } from './reviewTypes';

interface StatProps {
  icon: ReactNode;
  value: string;
  unit?: string;
  label: string;
}

function Stat({ icon, value, unit, label }: StatProps) {
  return (
    <div className="flex-1 px-2 py-3 text-center">
      <span className="flex justify-center mb-1">{icon}</span>
      <p className="num text-2xl font-bold text-ink">
        {value}
        {unit && (
          <span className="text-sm font-medium text-ink-3"> {unit}</span>
        )}
      </p>
      <p className="text-ink-2 text-sm">{label}</p>
    </div>
  );
}

interface SummaryStatsProps {
  weeklyData: WeeklyReviewData;
  weeklyAvg: Macros | null;
  weekRange: { start: string; end: string };
  profile: UserProfile;
}

// Week range, three headline numbers, and the daily-average nutrition rings.
export function SummaryStats({
  weeklyData,
  weeklyAvg,
  weekRange,
  profile,
}: SummaryStatsProps) {
  const targets: Macros = {
    calories: profile.calorie_target,
    protein: profile.protein_target_g,
    carbs: profile.carbs_target_g,
    fat: profile.fat_target_g,
  };
  const { weightChange } = weeklyData;

  return (
    <>
      <div>
        <p className="text-ink-2 text-sm">Week of</p>
        <p className="num text-lg font-bold text-ink">
          {formatDisplayDate(weekRange.start)} –{' '}
          {formatDisplayDate(weekRange.end)}
        </p>
      </div>

      <div className="flex divide-x divide-line border border-line rounded-xl">
        <Stat
          icon={<Scale size={20} className="text-body-ink" />}
          value={
            weightChange !== null
              ? `${weightChange > 0 ? '+' : ''}${weightChange}`
              : '--'
          }
          unit={weightChange !== null ? 'kg' : undefined}
          label="Weight change"
        />
        <Stat
          icon={<Target size={20} className="text-eat-ink" />}
          value={`${weeklyData.calorieAdherence}`}
          unit="%"
          label="Cal adherence"
        />
        <Stat
          icon={<Dumbbell size={20} className="text-train-ink" />}
          value={`${weeklyData.totalWorkouts}`}
          label="Workouts"
        />
      </div>

      {/* Weekly-average rings: same visual language as Dashboard and
          CalorieLog, averaged across 7 days. */}
      {weeklyAvg && (
        <div className="border border-line rounded-xl p-4">
          <p className="text-sm font-semibold text-ink-2 mb-3">
            Daily average this week
          </p>
          <div className="flex items-center gap-4 justify-center">
            <NutritionRings
              consumed={weeklyAvg}
              targets={targets}
              size={128}
              title="Weekly average nutrition rings"
            />
            <div className="flex-1">
              <MacroLegend consumed={weeklyAvg} targets={targets} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
