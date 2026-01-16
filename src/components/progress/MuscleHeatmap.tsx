import type { MuscleGroupBreakdown } from '../../hooks/useStrengthProgress';
import { Card, CardContent } from '../ui';

interface MuscleHeatmapProps {
  breakdown: MuscleGroupBreakdown[];
  totalSets: number;
  weekStart: string;
  weekEnd: string;
}

// Recommended weekly sets per muscle group for hypertrophy (MEV to MRV range)
const RECOMMENDED_SETS: Record<string, { min: number; max: number }> = {
  Chest: { min: 10, max: 20 },
  Back: { min: 10, max: 20 },
  Shoulders: { min: 8, max: 16 },
  Biceps: { min: 6, max: 14 },
  Triceps: { min: 6, max: 14 },
  Quads: { min: 8, max: 18 },
  Hamstrings: { min: 6, max: 14 },
  Glutes: { min: 6, max: 16 },
  Calves: { min: 6, max: 12 },
  Core: { min: 6, max: 12 },
  Arms: { min: 6, max: 14 },
  Legs: { min: 10, max: 20 },
  Forearms: { min: 4, max: 10 },
};

// Get color based on percentage of recommended sets
function getHeatColor(sets: number, muscleGroup: string): string {
  const recommended = RECOMMENDED_SETS[muscleGroup] || { min: 8, max: 16 };
  const midpoint = (recommended.min + recommended.max) / 2;

  if (sets === 0) {
    return 'bg-slate-800 text-slate-500';
  }

  const ratio = sets / midpoint;

  if (ratio < 0.25) {
    return 'bg-red-900/50 text-red-300 border-red-700/50';
  }
  if (ratio < 0.5) {
    return 'bg-orange-900/50 text-orange-300 border-orange-700/50';
  }
  if (ratio < 0.75) {
    return 'bg-yellow-900/50 text-yellow-300 border-yellow-700/50';
  }
  if (ratio <= 1.25) {
    return 'bg-green-900/50 text-green-300 border-green-700/50';
  }
  // Over recommended max
  return 'bg-blue-900/50 text-blue-300 border-blue-700/50';
}

// Get status label
function getStatusLabel(sets: number, muscleGroup: string): string {
  const recommended = RECOMMENDED_SETS[muscleGroup] || { min: 8, max: 16 };

  if (sets === 0) return 'Not trained';
  if (sets < recommended.min) return 'Below minimum';
  if (sets <= recommended.max) return 'Optimal';
  return 'High volume';
}

// Format date range for display
function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');

  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
  };

  return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
}

// All standard muscle groups to display
const ALL_MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Core',
];

export function MuscleHeatmap({
  breakdown,
  totalSets,
  weekStart,
  weekEnd,
}: MuscleHeatmapProps) {
  // Create a map for quick lookup
  const breakdownMap = new Map(breakdown.map((b) => [b.muscleGroup, b]));

  // Merge with all muscle groups (show 0 for muscles not trained)
  const displayData = ALL_MUSCLE_GROUPS.map((muscleGroup) => {
    const data = breakdownMap.get(muscleGroup);
    return {
      muscleGroup,
      setsCompleted: data?.setsCompleted ?? 0,
      totalVolume: data?.totalVolume ?? 0,
      percentOfTotal: data?.percentOfTotal ?? 0,
    };
  });

  // Add any additional muscle groups from breakdown that aren't in standard list
  breakdown.forEach((b) => {
    if (!ALL_MUSCLE_GROUPS.includes(b.muscleGroup)) {
      displayData.push({
        muscleGroup: b.muscleGroup,
        setsCompleted: b.setsCompleted,
        totalVolume: b.totalVolume,
        percentOfTotal: b.percentOfTotal,
      });
    }
  });

  // Sort by sets completed (descending) but keep untrained at the end
  displayData.sort((a, b) => {
    if (a.setsCompleted === 0 && b.setsCompleted > 0) return 1;
    if (b.setsCompleted === 0 && a.setsCompleted > 0) return -1;
    return b.setsCompleted - a.setsCompleted;
  });

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">
            Weekly Muscle Coverage
          </h3>
          <span className="text-sm text-slate-400">
            {formatDateRange(weekStart, weekEnd)}
          </span>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-4 mb-4 p-3 bg-slate-800/50 rounded-lg">
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{totalSets}</p>
            <p className="text-xs text-slate-400">Total Sets</p>
          </div>
          <div className="h-8 w-px bg-slate-700" />
          <div className="text-center">
            <p className="text-2xl font-bold text-white">
              {displayData.filter((d) => d.setsCompleted > 0).length}
            </p>
            <p className="text-xs text-slate-400">Muscles Trained</p>
          </div>
          <div className="h-8 w-px bg-slate-700" />
          <div className="text-center">
            <p className="text-2xl font-bold text-white">
              {
                displayData.filter((d) => {
                  const rec = RECOMMENDED_SETS[d.muscleGroup];
                  return rec && d.setsCompleted >= rec.min;
                }).length
              }
            </p>
            <p className="text-xs text-slate-400">Hit Minimum</p>
          </div>
        </div>

        {/* Muscle Grid */}
        <div className="grid grid-cols-2 gap-2">
          {displayData.map((item) => {
            const recommended = RECOMMENDED_SETS[item.muscleGroup] || {
              min: 8,
              max: 16,
            };
            const colorClass = getHeatColor(
              item.setsCompleted,
              item.muscleGroup,
            );
            const status = getStatusLabel(item.setsCompleted, item.muscleGroup);

            return (
              <div
                key={item.muscleGroup}
                className={`p-3 rounded-lg border ${colorClass} transition-colors`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">
                    {item.muscleGroup}
                  </span>
                  <span className="text-lg font-bold">
                    {item.setsCompleted}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs opacity-80">
                  <span>{status}</span>
                  <span>
                    Target: {recommended.min}-{recommended.max}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-1.5 bg-black/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-current rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, (item.setsCompleted / recommended.max) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 pt-4 border-t border-slate-700">
          <p className="text-xs text-slate-500 mb-2">Volume Status</p>
          <div className="flex flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-red-900/50 border border-red-700/50" />
              <span className="text-slate-400">Very Low</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-orange-900/50 border border-orange-700/50" />
              <span className="text-slate-400">Low</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-yellow-900/50 border border-yellow-700/50" />
              <span className="text-slate-400">Moderate</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-green-900/50 border border-green-700/50" />
              <span className="text-slate-400">Optimal</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-blue-900/50 border border-blue-700/50" />
              <span className="text-slate-400">High</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
