import { describe, expect, it } from 'vitest';
import type { AIFoodAnalysisResponse } from '../../types';
import {
  calculateDeterministicTargets,
  normalizeFoodAnalysis,
  weightForMacros,
} from './nutritionCoach';

// --------------------------------------------------------------------------
// calculateDeterministicTargets — Mifflin-St Jeor BMR + macro split
// --------------------------------------------------------------------------

describe('calculateDeterministicTargets', () => {
  // Anchor case from manual calc: male, 30y, 180cm, 80kg, moderate, bulk
  // BMR = 10*80 + 6.25*180 - 5*30 + 5 = 1780
  // TDEE = 1780 * 1.55 = 2759
  // Surplus = clamp(2759 * 0.15, 300, 500) = 413.85
  // Calories = roundToNearest(3172.85, 25) = 3175
  // Protein = round(80 * 1.8) = 144; Fat = round(max(48, 88.2)) = 88
  // Carbs = round((3175 - 576 - 792) / 4) = 452
  it('produces correct targets for a typical male bulker', () => {
    const result = calculateDeterministicTargets({
      age: 30,
      gender: 'male',
      height_cm: 180,
      weight_kg: 80,
      activity_level: 'moderate',
      goal: 'bulk',
    });
    expect(result.calorie_target).toBe(3175);
    expect(result.protein_g).toBe(144);
    expect(result.fat_g).toBe(88);
    expect(result.carbs_g).toBe(452);
  });

  it('uses the female BMR offset (-161 instead of +5)', () => {
    // BMR = 10*60 + 6.25*165 - 5*28 - 161 = 1330.25
    // TDEE = 1330.25 * 1.375 = 1829.094
    // Cut deficit = -clamp(1829.094 * 0.2, 300, 750) = -365.819
    // Calories = roundToNearest(1463.275, 25) = 1475 (58.53 rounds up to 59)
    const result = calculateDeterministicTargets({
      age: 28,
      gender: 'female',
      height_cm: 165,
      weight_kg: 60,
      activity_level: 'light',
      goal: 'cut',
    });
    expect(result.calorie_target).toBe(1475);
    expect(result.protein_g).toBe(126); // 60 * 2.1
  });

  it('shares calorie target between recomp and maintain (only protein differs)', () => {
    const base = {
      age: 30,
      gender: 'male' as const,
      height_cm: 180,
      weight_kg: 80,
      activity_level: 'moderate' as const,
    };
    const recomp = calculateDeterministicTargets({ ...base, goal: 'recomp' });
    const maintain = calculateDeterministicTargets({
      ...base,
      goal: 'maintain',
    });
    // Both should sit at TDEE — no goal-driven calorie change
    expect(recomp.calorie_target).toBe(maintain.calorie_target);
    // But protein multipliers diverge (2.1 vs 1.9)
    expect(recomp.protein_g).toBeGreaterThan(maintain.protein_g);
    expect(recomp.protein_g).toBe(168); // 80 * 2.1
    expect(maintain.protein_g).toBe(152); // 80 * 1.9
  });

  it('produces a surplus for bulks and a deficit for cuts', () => {
    const base = {
      age: 30,
      gender: 'male' as const,
      height_cm: 180,
      weight_kg: 80,
      activity_level: 'moderate' as const,
    };
    const maintain = calculateDeterministicTargets({
      ...base,
      goal: 'maintain',
    });
    const bulk = calculateDeterministicTargets({ ...base, goal: 'bulk' });
    const leanBulk = calculateDeterministicTargets({
      ...base,
      goal: 'lean_bulk',
    });
    const cut = calculateDeterministicTargets({ ...base, goal: 'cut' });

    expect(bulk.calorie_target).toBeGreaterThan(maintain.calorie_target);
    expect(leanBulk.calorie_target).toBeGreaterThan(maintain.calorie_target);
    expect(leanBulk.calorie_target).toBeLessThan(bulk.calorie_target);
    expect(cut.calorie_target).toBeLessThan(maintain.calorie_target);
  });

  it('never produces negative carbs (floor at 0)', () => {
    // Aggressive cut on a high-protein-multiplier profile could squeeze carbs.
    // Verify the Math.max(0, ...) floor.
    const result = calculateDeterministicTargets({
      age: 60,
      gender: 'female',
      height_cm: 150,
      weight_kg: 45,
      activity_level: 'sedentary',
      goal: 'cut',
    });
    expect(result.carbs_g).toBeGreaterThanOrEqual(0);
  });

  it('uses adjusted body weight for macros when BMI > 30', () => {
    // 100kg, 170cm → BMI = 100/2.89 = 34.6 (obese)
    // IBW @ BMI 27.5 = 27.5 * 2.89 = 79.475
    // ABW = 79.475 + 0.25 * (100 - 79.475) = 84.6
    // Protein @ cut = round(84.6 * 2.1) = 178 (NOT 100 * 2.1 = 210)
    const result = calculateDeterministicTargets({
      age: 35,
      gender: 'male',
      height_cm: 170,
      weight_kg: 100,
      activity_level: 'sedentary',
      goal: 'cut',
    });
    expect(result.protein_g).toBe(178);
    // BMR is still computed from raw 100kg (energy expenditure scales with mass)
    // BMR = 1000 + 1062.5 - 175 + 5 = 1892.5
    // TDEE = 1892.5 * 1.2 = 2271
    // Deficit = -clamp(2271 * 0.2, 300, 750) = -454.2
    // Calories = roundToNearest(1816.8, 25) = 1825
    expect(result.calorie_target).toBe(1825);
  });
});

// --------------------------------------------------------------------------
// weightForMacros — obese-individual adjustment
// --------------------------------------------------------------------------

describe('weightForMacros', () => {
  const baseProfile = {
    age: 30,
    gender: 'male' as const,
    activity_level: 'moderate' as const,
    goal: 'maintain' as const,
  };

  it('returns actual weight at BMI <= 30', () => {
    // 80kg, 180cm → BMI 24.7
    expect(
      weightForMacros({ ...baseProfile, height_cm: 180, weight_kg: 80 }),
    ).toBe(80);
  });

  it('returns actual weight at BMI exactly 30 (boundary)', () => {
    // 30 * 1.8^2 = 97.2kg @ 180cm = BMI 30
    expect(
      weightForMacros({ ...baseProfile, height_cm: 180, weight_kg: 97.2 }),
    ).toBe(97.2);
  });

  it('returns adjusted weight below actual when BMI > 30', () => {
    // 100kg, 170cm → BMI 34.6
    const adjusted = weightForMacros({
      ...baseProfile,
      height_cm: 170,
      weight_kg: 100,
    });
    expect(adjusted).toBeLessThan(100);
    expect(adjusted).toBeCloseTo(84.6, 1);
  });
});

// --------------------------------------------------------------------------
// normalizeFoodAnalysis — totals + per-item reconciliation + not-food
// --------------------------------------------------------------------------

describe('normalizeFoodAnalysis', () => {
  it('recomputes totals from per-item values', () => {
    // LLM-style error: stated total doesn't match sum of items
    const response: AIFoodAnalysisResponse = {
      items: [
        {
          name: 'rice',
          portion_grams: 150,
          calories: 195,
          protein_g: 4,
          carbs_g: 42,
          fat_g: 0.5,
        },
        {
          name: 'chicken',
          portion_grams: 100,
          calories: 165,
          protein_g: 31,
          carbs_g: 0,
          fat_g: 3.6,
        },
      ],
      total: { calories: 999, protein_g: 999, carbs_g: 999, fat_g: 999 },
    };
    const result = normalizeFoodAnalysis(response);
    expect(result.total.calories).toBeCloseTo(360, 0);
    expect(result.total.protein_g).toBeCloseTo(35, 0);
    expect(result.total.carbs_g).toBeCloseTo(42, 0);
    expect(result.total.fat_g).toBeCloseTo(4.1, 1);
  });

  it('trims whitespace from item names', () => {
    const response: AIFoodAnalysisResponse = {
      items: [
        {
          name: '  banana  ',
          portion_grams: 120,
          calories: 105,
          protein_g: 1.3,
          carbs_g: 27,
          fat_g: 0.3,
        },
      ],
      total: { calories: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.3 },
    };
    expect(normalizeFoodAnalysis(response).items[0].name).toBe('banana');
  });

  it('preserves stated calories when macro math is within tolerance', () => {
    // macroDerived = 4*4 + 42*4 + 0.5*9 = 188.5
    // stated = 195; drift = 6.5; tolerance = max(50, 37.7) = 50 → preserve
    const response: AIFoodAnalysisResponse = {
      items: [
        {
          name: 'rice',
          portion_grams: 150,
          calories: 195,
          protein_g: 4,
          carbs_g: 42,
          fat_g: 0.5,
        },
      ],
      total: { calories: 195, protein_g: 4, carbs_g: 42, fat_g: 0.5 },
    };
    expect(normalizeFoodAnalysis(response).items[0].calories).toBe(195);
  });

  it('corrects calories when macro math drifts beyond tolerance', () => {
    // macroDerived = 20*4 + 30*4 + 10*9 = 290
    // stated = 500; drift = 210; tolerance = max(50, 58) = 58 → reset to 290
    const response: AIFoodAnalysisResponse = {
      items: [
        {
          name: 'confabulated meal',
          portion_grams: 200,
          calories: 500,
          protein_g: 20,
          carbs_g: 30,
          fat_g: 10,
        },
      ],
      total: { calories: 500, protein_g: 20, carbs_g: 30, fat_g: 10 },
    };
    const result = normalizeFoodAnalysis(response);
    expect(result.items[0].calories).toBe(290);
    // The corrected calories also propagate into the recomputed total
    expect(result.total.calories).toBe(290);
  });

  it('does not over-correct very low-calorie items (50 kcal absolute floor)', () => {
    // macroDerived = 0 + 8 + 0 = 8; stated = 30 (artificial sweeteners etc.)
    // drift = 22; tolerance = max(50, 1.6) = 50 → preserve
    const response: AIFoodAnalysisResponse = {
      items: [
        {
          name: 'sugar-free gum',
          portion_grams: 3,
          calories: 30,
          protein_g: 0,
          carbs_g: 2,
          fat_g: 0,
        },
      ],
      total: { calories: 30, protein_g: 0, carbs_g: 2, fat_g: 0 },
    };
    expect(normalizeFoodAnalysis(response).items[0].calories).toBe(30);
  });

  it('short-circuits empty items + preserves not_food_reason', () => {
    const response: AIFoodAnalysisResponse = {
      items: [],
      total: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      not_food_reason: 'image shows a cat, not food',
    };
    const result = normalizeFoodAnalysis(response);
    expect(result.items).toEqual([]);
    expect(result.not_food_reason).toBe('image shows a cat, not food');
    expect(result.total).toEqual({
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    });
  });

  it('zeros out totals on empty items even if input total is non-zero', () => {
    // Defensive: don't trust whatever the LLM put in total when items are empty.
    const response: AIFoodAnalysisResponse = {
      items: [],
      total: { calories: 500, protein_g: 50, carbs_g: 50, fat_g: 20 },
      not_food_reason: 'not food',
    };
    expect(normalizeFoodAnalysis(response).total).toEqual({
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    });
  });
});
