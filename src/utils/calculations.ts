// Calculate body fat percentage using US Navy method
export function calculateBodyFatPercentage(
  gender: 'male' | 'female',
  waist_cm: number,
  neck_cm: number,
  height_cm: number,
  hip_cm?: number, // Required for females, optional for males
): number {
  if (gender === 'male') {
    // Male formula: 495 / (1.0324 - 0.19077 * log10(waist - neck) + 0.15456 * log10(height)) - 450
    const bodyFat =
      495 /
        (1.0324 -
          0.19077 * Math.log10(waist_cm - neck_cm) +
          0.15456 * Math.log10(height_cm)) -
      450;
    return Math.max(0, Math.round(bodyFat * 10) / 10);
  } else {
    // Female formula: 495 / (1.29579 - 0.35004 * log10(waist + hip - neck) + 0.22100 * log10(height)) - 450
    // If hip not provided, use simplified calculation
    const hipValue = hip_cm || waist_cm * 1.05; // Rough estimate if not provided
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

// Calculate weekly weight change
export function calculateWeeklyWeightChange(
  weights: { date: string | Date; weight_kg: number }[],
): number {
  if (weights.length < 2) return 0;

  // Get first and last weights
  const sortedWeights = [...weights].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const firstWeight = sortedWeights[0].weight_kg;
  const lastWeight = sortedWeights[sortedWeights.length - 1].weight_kg;

  // Calculate days difference more accurately
  const firstDate = new Date(sortedWeights[0].date);
  const lastDate = new Date(sortedWeights[sortedWeights.length - 1].date);

  // Reset time to midnight to get accurate day difference
  firstDate.setHours(0, 0, 0, 0);
  lastDate.setHours(0, 0, 0, 0);

  const daysDiff = Math.round(
    (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  // Need at least 3 days of data for a meaningful weekly projection
  // Otherwise, daily fluctuations get amplified unrealistically
  if (daysDiff < 3) {
    // For less than 3 days, just return the raw daily change (not extrapolated)
    // This prevents showing misleading -4.9 kg/week from a 0.7kg daily fluctuation
    const totalChange = lastWeight - firstWeight;
    return Math.round(totalChange * 100) / 100;
  }

  // Calculate weekly rate
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
