// Calculate body fat percentage using US Navy method
export function calculateBodyFatPercentage(
  gender: 'male' | 'female',
  waist_cm: number,
  neck_cm: number,
  height_cm: number,
  hip_cm?: number // Required for females, optional for males
): number {
  if (gender === 'male') {
    // Male formula: 495 / (1.0324 - 0.19077 * log10(waist - neck) + 0.15456 * log10(height)) - 450
    const bodyFat = 495 / (1.0324 - 0.19077 * Math.log10(waist_cm - neck_cm) + 0.15456 * Math.log10(height_cm)) - 450;
    return Math.max(0, Math.round(bodyFat * 10) / 10);
  } else {
    // Female formula: 495 / (1.29579 - 0.35004 * log10(waist + hip - neck) + 0.22100 * log10(height)) - 450
    // If hip not provided, use simplified calculation
    const hipValue = hip_cm || waist_cm * 1.05; // Rough estimate if not provided
    const bodyFat = 495 / (1.29579 - 0.35004 * Math.log10(waist_cm + hipValue - neck_cm) + 0.22100 * Math.log10(height_cm)) - 450;
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
  }
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
  weightChange: number // positive = gained, negative = lost
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
  weights: { date: string; weight_kg: number }[]
): number {
  if (weights.length < 2) return 0;
  
  // Get first and last weights
  const sortedWeights = [...weights].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  
  const firstWeight = sortedWeights[0].weight_kg;
  const lastWeight = sortedWeights[sortedWeights.length - 1].weight_kg;
  const daysDiff = Math.ceil(
    (new Date(sortedWeights[sortedWeights.length - 1].date).getTime() - 
     new Date(sortedWeights[0].date).getTime()) / 
    (1000 * 60 * 60 * 24)
  );
  
  if (daysDiff === 0) return 0;
  
  // Calculate weekly rate
  const totalChange = lastWeight - firstWeight;
  const weeklyChange = (totalChange / daysDiff) * 7;
  
  return Math.round(weeklyChange * 100) / 100;
}
