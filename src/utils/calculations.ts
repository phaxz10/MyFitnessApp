// US Navy body fat estimation method (Hodgdon & Beckett, 1984).
// Uses circumference measurements as a proxy for body density, then converts
// to body fat percentage via the Siri equation (495/density - 450).
// Accuracy: +/- 3-4% vs DEXA scan. Good enough for tracking trends over time.
// Male formula uses waist and neck; female adds hip circumference.
export function calculateBodyFatPercentage(
  gender: 'male' | 'female',
  waist_cm: number,
  neck_cm: number,
  height_cm: number,
  hip_cm?: number,
): number {
  if (gender === 'male') {
    // BF% = 495 / (1.0324 - 0.19077*log10(waist-neck) + 0.15456*log10(height)) - 450
    const bodyFat =
      495 /
        (1.0324 -
          0.19077 * Math.log10(waist_cm - neck_cm) +
          0.15456 * Math.log10(height_cm)) -
      450;
    return Math.max(0, Math.round(bodyFat * 10) / 10);
  } else {
    // BF% = 495 / (1.29579 - 0.35004*log10(waist+hip-neck) + 0.22100*log10(height)) - 450
    const hipValue = hip_cm || waist_cm * 1.05; // rough estimate if hip not measured
    const bodyFat =
      495 /
        (1.29579 -
          0.35004 * Math.log10(waist_cm + hipValue - neck_cm) +
          0.221 * Math.log10(height_cm)) -
      450;
    return Math.max(0, Math.round(bodyFat * 10) / 10);
  }
}

// Recalculate macros based on portion change
export function recalculateMacros(
  originalPortion: number,
  newPortion: number,
  originalValues: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  },
): {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
} {
  const ratio = newPortion / originalPortion;
  return {
    calories: Math.round(originalValues.calories * ratio),
    protein_g: Math.round(originalValues.protein_g * ratio * 10) / 10,
    carbs_g: Math.round(originalValues.carbs_g * ratio * 10) / 10,
    fat_g: Math.round(originalValues.fat_g * ratio * 10) / 10,
  };
}

// Format numbers for display
export function formatCalories(calories: number): string {
  return calories.toLocaleString();
}

export function formatMacro(value: number): string {
  return value.toFixed(1);
}

export function formatWeight(kg: number): string {
  return kg.toFixed(1);
}

// Calculate progress percentage
export function calculateProgress(current: number, target: number): number {
  if (target === 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

// Determine if weight trend matches goal
export function isOnTrackWithGoal(
  goal: 'bulk' | 'lean_bulk' | 'recomp' | 'cut' | 'maintain',
  weightChange: number, // positive = gained, negative = lost
): boolean {
  switch (goal) {
    case 'bulk':
    case 'lean_bulk':
      return weightChange > 0;
    case 'cut':
      return weightChange < 0;
    case 'maintain':
    case 'recomp':
      return Math.abs(weightChange) < 0.5; // Within 0.5kg is considered stable
    default:
      return true;
  }
}

// Projects a weekly weight change rate from a set of weight measurements.
// With < 3 days of data, returns the raw change instead of extrapolating,
// because daily water/food fluctuations (0.5-1kg) would produce misleading
// weekly projections (e.g. a 0.7kg daily swing -> "4.9 kg/week").
// With 3+ days, extrapolates: (totalChange / days) * 7.
export function calculateWeeklyWeightChange(
  weights: { date: string | Date; weight_kg: number }[],
): number {
  if (weights.length < 2) return 0;

  const sortedWeights = [...weights].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const firstWeight = sortedWeights[0].weight_kg;
  const lastWeight = sortedWeights[sortedWeights.length - 1].weight_kg;

  const firstDate = new Date(sortedWeights[0].date);
  const lastDate = new Date(sortedWeights[sortedWeights.length - 1].date);

  firstDate.setHours(0, 0, 0, 0);
  lastDate.setHours(0, 0, 0, 0);

  const daysDiff = Math.round(
    (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysDiff < 3) {
    const totalChange = lastWeight - firstWeight;
    return Math.round(totalChange * 100) / 100;
  }

  const totalChange = lastWeight - firstWeight;
  const weeklyChange = (totalChange / daysDiff) * 7;

  return Math.round(weeklyChange * 100) / 100;
}

// Check if we have enough data for a meaningful weekly projection
export function hasEnoughDataForWeeklyTrend(
  weights: { date: string | Date; weight_kg: number }[],
): boolean {
  if (weights.length < 2) return false;

  const sortedWeights = [...weights].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const firstDate = new Date(sortedWeights[0].date);
  const lastDate = new Date(sortedWeights[sortedWeights.length - 1].date);

  firstDate.setHours(0, 0, 0, 0);
  lastDate.setHours(0, 0, 0, 0);

  const daysDiff = Math.round(
    (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  return daysDiff >= 3;
}
