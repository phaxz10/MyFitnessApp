import { MUSCLE_GROUPS } from '@/constants/musclegroups';
import type { MuscleGroupBreakdown } from '../../hooks/useStrengthProgress';
import { Card, CardContent, CardHeader, CardTitle } from '../ui';
import { StatRow } from './StatRow';

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

// Train-soft to train intensity steps, by share of the target midpoint.
// `cell` fills a grid cell; `swatch` is the legend chip (the untrained chip
// gets an outline so it reads against the surface).
const HEAT_STEPS = [
  {
    cell: 'bg-sunken text-ink-3',
    swatch: 'bg-sunken border border-line-strong',
    label: 'Not trained',
  },
  {
    cell: 'bg-train-soft text-train-ink',
    swatch: 'bg-train-soft',
    label: 'Under half of target',
  },
  {
    cell: 'bg-train/40 text-ink',
    swatch: 'bg-train/40',
    label: 'Up to target',
  },
  {
    cell: 'bg-train text-on-accent',
    swatch: 'bg-train',
    label: 'At or over target',
  },
];

function getHeatStep(sets: number, muscleGroup: string) {
  const recommended = RECOMMENDED_SETS[muscleGroup] || { min: 8, max: 16 };
  const midpoint = (recommended.min + recommended.max) / 2;

  if (sets === 0) return HEAT_STEPS[0];
  const ratio = sets / midpoint;
  if (ratio < 0.5) return HEAT_STEPS[1];
  if (ratio <= 1) return HEAT_STEPS[2];
  return HEAT_STEPS[3];
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
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);

  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
  };

  return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
}

export function MuscleHeatmap({
  breakdown,
  totalSets,
  weekStart,
  weekEnd,
}: MuscleHeatmapProps) {
  // Create a map for quick lookup
  const breakdownMap = new Map(breakdown.map((b) => [b.muscleGroup, b]));

  // Merge with all muscle groups (show 0 for muscles not trained)
  const displayData = MUSCLE_GROUPS.map((muscleGroup) => {
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
    if (!MUSCLE_GROUPS.includes(b.muscleGroup)) {
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

  const trainedCount = displayData.filter((d) => d.setsCompleted > 0).length;
  const minimumCount = displayData.filter((d) => {
    const rec = RECOMMENDED_SETS[d.muscleGroup];
    return rec && d.setsCompleted >= rec.min;
  }).length;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-3">
        <CardTitle>Weekly muscle coverage</CardTitle>
        <span className="num text-sm text-ink-3">
          {formatDateRange(weekStart, weekEnd)}
        </span>
      </CardHeader>

      <StatRow
        className="border-b border-line"
        stats={[
          { label: 'Total sets', value: totalSets },
          { label: 'Muscles trained', value: trainedCount },
          { label: 'Hit minimum', value: minimumCount },
        ]}
      />

      {/* One heat grid inside the module: hairline-separated cells, no tiles */}
      <div className="grid grid-cols-2 gap-px border-b border-line bg-line">
        {displayData.map((item, index) => {
          const recommended = RECOMMENDED_SETS[item.muscleGroup] || {
            min: 8,
            max: 16,
          };
          const step = getHeatStep(item.setsCompleted, item.muscleGroup);
          const status = getStatusLabel(item.setsCompleted, item.muscleGroup);

          return (
            <div
              key={item.muscleGroup}
              className={`px-4 py-3 ${step.cell} ${
                // An odd last cell spans the row so no empty gap shows.
                displayData.length % 2 === 1 && index === displayData.length - 1
                  ? 'col-span-2'
                  : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  {item.muscleGroup}
                </span>
                <span className="num text-xl font-bold">
                  {item.setsCompleted}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs opacity-90">
                <span>{status}</span>
                <span className="num">
                  {recommended.min}-{recommended.max}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-current/20">
                <div
                  className="h-full rounded-full bg-current transition-all duration-300"
                  style={{
                    width: `${Math.min(100, (item.setsCompleted / recommended.max) * 100)}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <CardContent>
        <div>
          <p className="mb-2 text-sm font-semibold text-ink-2">
            Sets vs weekly target
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs">
            {HEAT_STEPS.map((step) => (
              <div key={step.label} className="flex items-center gap-1.5">
                <span
                  className={`size-3 rounded-sm ${step.swatch}`}
                  aria-hidden="true"
                />
                <span className="text-ink-2">{step.label}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
