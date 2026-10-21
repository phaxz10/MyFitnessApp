import { z } from 'zod';
import type {
  AIWeeklyReviewResponse,
  UserProfile,
  WeeklyReviewData,
} from '../../types';
import { calculateAgeFromBirthdate } from '../../utils/date';
import { complete } from '../ai/aiClient';

// No web search: the metabolic-adaptation guidance below is fixed knowledge,
// and ':online' is billed per request.
//
// SCHEMA — review responses drive UI modals that adjust user targets,
// so validating shape catches regressions before they corrupt the Profile.
// Every nullable field is intentional: null means "no change recommended."

// A week's review only changes when the week's data or the profile does —
// both are in the prompt, which is the cache key.
const WEEKLY_REVIEW_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const weeklyReviewSchema = z.object({
  summary: z.string(),
  onTrack: z.boolean(),
  metabolicResponse: z.object({
    type: z.enum(['thrifty', 'normal', 'spendthrift']),
    analysis: z.string(),
    recommendation: z.string(),
  }),
  progressAssessment: z.object({
    weightProgress: z.string(),
    calorieAdherence: z.string(),
    workoutConsistency: z.string(),
  }),
  recommendations: z.object({
    updateMeasurements: z.boolean(),
    measurementsReason: z.string().nullable(),
    adjustCalories: z.boolean(),
    newCalorieTarget: z.number().nullable(),
    newProteinTarget: z.number().nullable(),
    newCarbsTarget: z.number().nullable(),
    newFatTarget: z.number().nullable(),
    caloriesReason: z.string().nullable(),
    dietBreakRecommended: z.boolean(),
    dietBreakReason: z.string().nullable(),
    changeGoal: z.boolean(),
    suggestedGoal: z
      .enum(['bulk', 'lean_bulk', 'recomp', 'cut', 'maintain'])
      .nullable(),
    goalReason: z.string().nullable(),
    changeProgram: z.boolean(),
    programSuggestion: z.string().nullable(),
  }),
  motivationalMessage: z.string(),
}) satisfies z.ZodType<AIWeeklyReviewResponse>;

// ============================================================================
// reviewWeeklyProgress — Monday check-in (metabolic response analysis)
// ============================================================================

// Fixed coaching framework first (system) so the prefix is identical every
// call; the user's numbers come last in the prompt.
const WEEKLY_REVIEW_INSTRUCTIONS = `You are a fitness coach conducting a weekly check-in review. Analyze the user's past week of progress (in the user message) and provide actionable recommendations.

METABOLIC RESPONSE ANALYSIS:
Compare actual weight change vs expected weight change to assess metabolic adaptation:

"Thrifty" Metabolic Response (signs of metabolic adaptation):
- Weight loss is SLOWER than expected despite calorie deficit
- Or weight gain is FASTER than expected on small surplus
- Body is conserving energy, reducing NEAT (non-exercise activity thermogenesis)
- Common after prolonged dieting or multiple cut cycles
- Recommendation: Consider diet break, reverse diet, or increase calories slightly to restore metabolic rate

"Spendthrift" Metabolic Response (metabolically flexible):
- Weight changes roughly match expected rates based on calorie intake
- Body responds predictably to calorie adjustments
- Good metabolic flexibility - continue current approach

"Hyper-Spendthrift" Response (rare):
- Weight loss is FASTER than expected
- Or difficulty gaining weight despite surplus
- High metabolic rate, body "wastes" excess energy as heat
- May need larger surplus for bulking goals

Provide a comprehensive weekly review. Consider:
1. Is the user on track for their goal?
2. Analyze their metabolic response: Is their body responding as expected to their calorie intake, or showing signs of metabolic adaptation (thrifty) or high metabolism (spendthrift)?
3. Should they update body measurements (weight, body fat)? Recommend this if no recent measurements or if significant weight change detected.
4. Should calorie targets be adjusted? Consider:
   - If showing "thrifty" response during a cut: may need a diet break or slight calorie increase
   - If showing "thrifty" response during bulk: current calories may be sufficient
   - If showing "spendthrift" response: continue current approach or adjust based on goals
5. Should the goal be changed? (e.g., cut -> maintenance for diet break if metabolically adapted)
6. Are there any workout/program adjustments needed?

IMPORTANT — respect the user's Diet Type when recommending macros: for "low_carb" or "keto", keep carbs within that strategy (keto ≈ 20-50g/day) and adjust calories via fat, not carbs. Do NOT recommend high-carb refeed days for a keto user. Only the "balanced" diet type should carry carbs as the high/residual macro.

Guidelines:
- Be encouraging but honest about metabolic adaptation
- If data shows thrifty response during a cut (weight not dropping despite deficit), suggest:
  * A 1-2 week "diet break" at maintenance calories to restore metabolic rate
  * Slightly increasing calories (100-200) to break through plateau
  * Adding refeed days (1-2 higher carb days per week)
- If data shows spendthrift response, reassure user their metabolism is healthy
- Only suggest goal changes if there's a clear reason (e.g., metabolic adaptation requiring diet break)
- Calorie adjustments should consider metabolic state, not just weight trends
- If data is limited, acknowledge uncertainty but note that consistent logging helps identify metabolic patterns
- Base guidance on evidence-based nutrition science (e.g. the kind of research summarised by Built With Science)

Output: a JSON object matching the provided schema. "summary" is 2-3 sentences; metabolicResponse.type is "thrifty", "normal" or "spendthrift"; use null for any recommendation field that does not apply (no change recommended); "motivationalMessage" is tailored to their progress and metabolic situation.`;

export async function reviewWeeklyProgress(
  profile: UserProfile,
  weeklyData: WeeklyReviewData,
): Promise<AIWeeklyReviewResponse> {
  const weightDataSummary = weeklyData.weightLogs
    .map(
      (w) =>
        `${w.date}: ${w.weight_kg}kg${w.body_fat_pct ? ` (${w.body_fat_pct}% BF)` : ''}`,
    )
    .join('\n');

  // 7700 kcal ≈ 1kg of body weight — used to estimate expected vs actual change
  const dailyDeficitOrSurplus =
    weeklyData.avgDailyCalories - profile.calorie_target;
  const weeklyCalorieDifference = dailyDeficitOrSurplus * 7;
  const expectedWeeklyWeightChange = weeklyCalorieDifference / 7700;

  const prompt = `Units: all weights below are in kg. When your reply mentions a weight, write it in ${profile.weight_unit ?? 'kg'} (1 kg = 2.2046 lbs).

User Profile:
- Age: ${calculateAgeFromBirthdate(profile.birthdate)}, Gender: ${profile.gender}, Height: ${profile.height_cm}cm
- Current Goal: ${profile.goal}
- Diet Type (carb strategy): ${profile.diet_type}
- Current Calorie Target: ${profile.calorie_target} kcal/day
- Macro Targets: ${profile.protein_target_g}g protein, ${profile.carbs_target_g}g carbs, ${profile.fat_target_g}g fat

Week Summary (${weeklyData.weekStart} to ${weeklyData.weekEnd}):
- Days with weight logged: ${weeklyData.daysWithWeightLog}
- Days with calories logged: ${weeklyData.daysWithCalorieLog}
- Workouts completed: ${weeklyData.totalWorkouts}

Weight Data:
${weightDataSummary || 'No weight logs this week'}
${weeklyData.weightChange !== null ? `Actual weekly weight change: ${weeklyData.weightChange > 0 ? '+' : ''}${weeklyData.weightChange.toFixed(2)}kg` : ''}

Calorie Adherence:
- Average daily intake: ${weeklyData.avgDailyCalories} kcal
- Target: ${profile.calorie_target} kcal
- Adherence: ${weeklyData.calorieAdherence}%
- Weekly calorie difference from target: ${weeklyCalorieDifference > 0 ? '+' : ''}${Math.round(weeklyCalorieDifference)} kcal
- Expected weight change based on intake: ${expectedWeeklyWeightChange > 0 ? '+' : ''}${expectedWeeklyWeightChange.toFixed(2)}kg`;

  return complete({
    instructions: WEEKLY_REVIEW_INSTRUCTIONS,
    prompt,
    schema: weeklyReviewSchema,
    schemaName: 'weekly_review',
    reasoning: 'medium',
    cache: {
      namespace: 'weekly_review',
      ttlMs: WEEKLY_REVIEW_CACHE_TTL_MS,
    },
  });
}
