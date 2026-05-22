import type { Tool } from 'openai/resources/responses/responses';
import { z } from 'zod';
import type {
  AIGoalReviewResponse,
  AIWeeklyReviewResponse,
  UserProfile,
  WeeklyReviewData,
  WeightLog,
} from '../../types';
import { calculateAgeFromBirthdate } from '../../utils/date';
import { complete } from '../ai/aiClient';

const WEB_SEARCH_TOOL: Tool = { type: 'web_search' };

// ============================================================================
// SCHEMAS — review responses drive UI modals that adjust user targets,
// so validating shape catches regressions before they corrupt state.
// ============================================================================

const goalReviewSchema = z.object({
  assessment: z.string(),
  on_track: z.boolean(),
  recommendations: z.object({
    calorie_target: z.number().nullable(),
    protein_g: z.number().nullable(),
    carbs_g: z.number().nullable(),
    fat_g: z.number().nullable(),
    goal_change: z.string().nullable(),
    reasoning: z.string(),
  }),
  program_suggestions: z.string(),
}) satisfies z.ZodType<AIGoalReviewResponse>;

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
// reviewGoals — broader, multi-week goal/calorie review
// ============================================================================

export async function reviewGoals(
  profile: UserProfile,
  weightHistory: WeightLog[],
  avgCalories: number,
  daysLogged: number,
  adherencePct: number,
): Promise<AIGoalReviewResponse> {
  const startWeight = weightHistory.length > 0 ? weightHistory[0].weight_kg : 0;
  const currentWeight =
    weightHistory.length > 0
      ? weightHistory[weightHistory.length - 1].weight_kg
      : 0;
  const weightChange = currentWeight - startWeight;
  const periodDays =
    weightHistory.length > 1
      ? Math.ceil(
          (new Date(weightHistory[weightHistory.length - 1].date).getTime() -
            new Date(weightHistory[0].date).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 0;

  const weightDataSummary = weightHistory
    .slice(-30)
    .map((w) => `${w.date}: ${w.weight_kg}kg`)
    .join('\n');

  const prompt = `Review my fitness progress and provide recommendations.

Current Profile:
- Age: ${calculateAgeFromBirthdate(profile.birthdate)}, Gender: ${profile.gender}, Height: ${profile.height_cm}cm
- Goal: ${profile.goal}
- Current calorie target: ${profile.calorie_target}

Weight History (recent):
${weightDataSummary}

Calorie Adherence:
- Average daily intake: ${avgCalories}
- Days logged: ${daysLogged}
- Target adherence: ${adherencePct}%

Current weight: ${currentWeight}kg
Starting weight: ${startWeight}kg
Weight change: ${weightChange.toFixed(1)}kg over ${periodDays} days

Analyze my progress and provide:
1. Assessment of current progress vs goal
2. Recommended calorie target adjustment (if any)
3. Suggested goal change (if appropriate)
4. Any other recommendations

Note:
- Use builtwithscience.com publicly available data as reference where applicable

Return JSON format only, no markdown code blocks:
{
  "assessment": "text analysis of progress",
  "on_track": true or false,
  "recommendations": {
    "calorie_target": new_target_or_null,
    "protein_g": new_protein_or_null,
    "carbs_g": new_carbs_or_null,
    "fat_g": new_fat_or_null,
    "goal_change": "suggested_goal_or_null",
    "reasoning": "why these changes"
  },
  "program_suggestions": "any workout program advice"
}`;

  return complete({
    prompt,
    schema: goalReviewSchema,
    tools: [WEB_SEARCH_TOOL],
  });
}

// ============================================================================
// reviewWeeklyProgress — Monday check-in (metabolic response analysis)
// ============================================================================

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

  const prompt = `You are a fitness coach conducting a weekly check-in review. Analyze the user's past week of progress and provide actionable recommendations.

User Profile:
- Age: ${calculateAgeFromBirthdate(profile.birthdate)}, Gender: ${profile.gender}, Height: ${profile.height_cm}cm
- Current Goal: ${profile.goal}
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
- Expected weight change based on intake: ${expectedWeeklyWeightChange > 0 ? '+' : ''}${expectedWeeklyWeightChange.toFixed(2)}kg

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

Based on this data, provide a comprehensive weekly review. Consider:
1. Is the user on track for their ${profile.goal} goal?
2. Analyze their metabolic response: Is their body responding as expected to their calorie intake, or showing signs of metabolic adaptation (thrifty) or high metabolism (spendthrift)?
3. Should they update body measurements (weight, body fat)? Recommend this if no recent measurements or if significant weight change detected.
4. Should calorie targets be adjusted? Consider:
   - If showing "thrifty" response during a cut: may need a diet break or slight calorie increase
   - If showing "thrifty" response during bulk: current calories may be sufficient
   - If showing "spendthrift" response: continue current approach or adjust based on goals
5. Should the goal be changed? (e.g., cut -> maintenance for diet break if metabolically adapted)
6. Are there any workout/program adjustments needed?

Return JSON format only, no markdown code blocks:
{
  "summary": "2-3 sentence overview of the week's progress",
  "onTrack": true/false,
  "metabolicResponse": {
    "type": "thrifty|normal|spendthrift",
    "analysis": "explanation of how body is responding to current calorie intake vs expected",
    "recommendation": "specific advice based on metabolic response"
  },
  "progressAssessment": {
    "weightProgress": "assessment of weight trend vs goal",
    "calorieAdherence": "assessment of calorie tracking consistency",
    "workoutConsistency": "assessment of workout frequency"
  },
  "recommendations": {
    "updateMeasurements": true/false,
    "measurementsReason": "why measurements should be updated, or null",
    "adjustCalories": true/false,
    "newCalorieTarget": new_target_number_or_null,
    "newProteinTarget": new_protein_or_null,
    "newCarbsTarget": new_carbs_or_null,
    "newFatTarget": new_fat_or_null,
    "caloriesReason": "explanation for calorie adjustment including metabolic response considerations, or null",
    "dietBreakRecommended": true/false,
    "dietBreakReason": "if thrifty response detected during cut, explain benefit of 1-2 week maintenance phase, or null",
    "changeGoal": true/false,
    "suggestedGoal": "bulk|lean_bulk|recomp|cut|maintain" or null,
    "goalReason": "why goal should change, or null",
    "changeProgram": true/false,
    "programSuggestion": "program advice or null"
  },
  "motivationalMessage": "encouraging message tailored to their progress and metabolic situation"
}

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
- Use builtwithscience.com publicly available data as reference where applicable`;

  return complete({
    prompt,
    schema: weeklyReviewSchema,
    tools: [WEB_SEARCH_TOOL],
  });
}
