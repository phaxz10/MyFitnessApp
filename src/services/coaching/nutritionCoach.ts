import { z } from 'zod';
import type {
  AIFoodAnalysisResponse,
  AIFoodItem,
  AITargetResponse,
  DietType,
} from '../../types';
import {
  complete,
  hashString,
  normalizeCacheText,
  webSearchTool,
} from '../ai/aiClient';

// Food text + food photo are the ONLY calls that request web search (paid per
// request on OpenRouter): branded/restaurant items need current nutrition
// facts. Helper: builds a tools map with web search included only when the
// active provider exposes one in the current configuration. Returns undefined when
// the model would have no tools to call (so generateText skips the tool path).
function maybeWebSearchTools() {
  const search = webSearchTool();
  return search ? { web_search: search } : undefined;
}

const foodItemSchema = z.object({
  name: z.string().min(1),
  portion_grams: z.number().nonnegative(),
  calories: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
});

// items is intentionally unbounded (no .min(1)) so the analyzer can return
// an explicit "no food detected" response — { items: [], not_food_reason }.
// A min(1) constraint would turn a correct refusal (e.g. photo of a cat)
// into a cryptic schema-mismatch error.
//
// not_food_reason uses .nullable() (not .optional()) because OpenAI's strict
// structured-output mode rejects optional fields — every property must appear
// in `required`. Using .nullable() means the AI must always emit the key,
// either as null (when input IS food) or a refusal string (when it isn't).
//
// No `total` field: normalizeFoodAnalysis() recomputes totals from the items,
// so asking the model for them only costs output tokens.
const foodAnalysisSchema = z.object({
  items: z.array(foodItemSchema),
  not_food_reason: z.string().nullable(),
});

const targetReasoningSchema = z.object({
  reasoning: z.string(),
});

// Food estimates rarely change; a 30-day cache means re-logging "2 eggs and
// toast" or re-analysing the same photo costs nothing.
const FOOD_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const TARGETS_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;

type TargetProfile = {
  age: number;
  gender: 'male' | 'female';
  height_cm: number;
  weight_kg: number;
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active';
  goal: 'bulk' | 'lean_bulk' | 'recomp' | 'cut' | 'maintain';
  // Optional so legacy callers (and tests) default to the balanced split.
  diet_type?: DietType;
};

// Fixed instruction blocks live in `system` (first, identical every call) so
// provider prefix caching can reuse them; only the food itself varies.
const FOOD_OUTPUT_RULES = `Output: one JSON object matching the provided schema — an "items" array (name, portion_grams, calories, protein_g, carbs_g, fat_g per distinct food) and "not_food_reason". All numeric values must be plain pre-computed numbers (e.g. 279, not "1.5 * 186"). No markdown.

"not_food_reason" is REQUIRED: null when the input is valid food or drink; otherwise items must be [] and not_food_reason a short explanation of what was provided instead.`;

const FOOD_TEXT_INSTRUCTIONS = `You estimate nutrition for food descriptions.

If the description is clearly NOT food or drink (e.g. "my dog", "happy thoughts", random characters, an object), return no items and explain in not_food_reason.

For valid food, use web search for branded/restaurant/package items when available. Prefer official nutrition facts, USDA-style references, or common serving databases. If exact data is unavailable, use a conservative generic estimate.

${FOOD_OUTPUT_RULES}`;

const FOOD_IMAGE_INSTRUCTIONS = `You estimate nutrition from food photos.

If the image does NOT contain food (e.g. a pet, a person, an object, a landscape, blurry/unrecognizable content), return no items and describe what is in the image in not_food_reason.

For valid food images, estimate visible portions in grams. Prefer conservative estimates and split distinct foods into separate items. Use web search for branded/restaurant items visible in the photo (logos, wrappers, packaging) for accurate data.

${FOOD_OUTPUT_RULES}`;

export async function analyzeFoodText(
  foodDescription: string,
): Promise<AIFoodAnalysisResponse> {
  return complete({
    instructions: FOOD_TEXT_INSTRUCTIONS,
    prompt: `Food: ${foodDescription}`,
    schema: foodAnalysisSchema,
    schemaName: 'food_analysis',
    reasoning: 'low',
    tools: maybeWebSearchTools(),
    temperature: 0.2,
    cache: {
      namespace: 'food_text',
      ttlMs: FOOD_CACHE_TTL_MS,
      key: foodTextCacheKey(foodDescription),
    },
  }).then(normalizeFoodAnalysis);
}

/** Cache identity for a food description: case/whitespace-insensitive. */
export function foodTextCacheKey(foodDescription: string): string {
  return normalizeCacheText(foodDescription);
}

export async function analyzeFoodImage(
  imageBase64: string,
  mimeType: string,
  textDescription?: string,
): Promise<AIFoodAnalysisResponse> {
  const context = textDescription?.trim()
    ? `Additional context from user: ${textDescription.trim()}`
    : 'Analyze this food image.';

  return complete({
    instructions: FOOD_IMAGE_INSTRUCTIONS,
    prompt: [
      {
        role: 'user',
        content: [
          { type: 'text', text: context },
          {
            type: 'image',
            image: `data:${mimeType};base64,${imageBase64}`,
          },
        ],
      },
    ],
    schema: foodAnalysisSchema,
    schemaName: 'food_analysis',
    reasoning: 'low',
    tools: maybeWebSearchTools(),
    temperature: 0.2,
    cache: {
      namespace: 'food_image',
      ttlMs: FOOD_CACHE_TTL_MS,
      // The image arrives already downscaled (prepareFoodImage), so the same
      // photo hashes the same regardless of the original camera resolution.
      key: {
        image: hashString(imageBase64),
        mimeType,
        context: textDescription ? normalizeCacheText(textDescription) : '',
      },
    },
  }).then(normalizeFoodAnalysis);
}

const TARGET_REASONING_INSTRUCTIONS = `Write a concise explanation for already-computed calorie and macro targets. Do not change the numbers.

The targets were computed with:
- Mifflin-St Jeor BMR
- Activity multiplier based on activity level
- Goal adjustment based on sustainable rate of change
- Protein from body weight; carbs set by diet type (balanced = remaining calories), fat fills the rest

Output: a JSON object with a single "reasoning" string. No markdown.`;

export async function calculateTargets(
  profile: TargetProfile,
): Promise<AITargetResponse> {
  const targets = calculateDeterministicTargets(profile);
  const prompt = `Profile:
- Age: ${profile.age}
- Gender: ${profile.gender}
- Height: ${profile.height_cm}cm
- Weight: ${profile.weight_kg}kg
- Activity Level: ${profile.activity_level}
- Goal: ${profile.goal}
- Diet type: ${profile.diet_type ?? 'balanced'}

Computed targets:
- Calories: ${targets.calorie_target} kcal/day
- Protein: ${targets.protein_g}g/day
- Carbs: ${targets.carbs_g}g/day
- Fat: ${targets.fat_g}g/day`;

  try {
    const result = await complete({
      instructions: TARGET_REASONING_INSTRUCTIONS,
      prompt,
      schema: targetReasoningSchema,
      schemaName: 'target_reasoning',
      temperature: 0.2,
      // Key is the full prompt (profile + computed numbers): any change to
      // either produces a fresh explanation.
      cache: { namespace: 'target_reasoning', ttlMs: TARGETS_CACHE_TTL_MS },
    });
    return { ...targets, reasoning: result.reasoning };
  } catch (err) {
    // Surface failures to the developer console so a degraded experience
    // (deterministic-only reasoning) doesn't hide an underlying outage,
    // API-key issue, or schema drift. The user still gets correct targets.
    console.warn(
      '[nutritionCoach] AI target reasoning failed, using deterministic fallback:',
      err,
    );
    return targets;
  }
}

// Deterministic target calculation using Mifflin-St Jeor BMR equation.
// The AI is only used to generate a human-readable explanation of the numbers —
// the numbers themselves are computed here to ensure consistency and testability.
//
// Protein always comes from a bodyweight multiplier (1.8-2.1g/kg based on goal).
// The carb/fat split then depends on diet_type (see ADR-0006):
//   - balanced (default): fat floored at 25% calories or 0.6g/kg, carbs absorb
//     the remaining calories (legacy behaviour, tends to land high-carb).
//   - moderate/low_carb/keto: carbs are pinned to the diet target and fat
//     absorbs the remainder, with a 0.6g/kg fat floor protecting essential fat.
//
// For obese individuals (BMI > 30) the macro multipliers use an adjusted
// bodyweight rather than the raw value — see weightForMacros(). BMR itself
// still uses raw bodyweight because energy expenditure does scale with total
// mass; only the protein/fat *targets* would otherwise become unrealistic.
export function calculateDeterministicTargets(
  profile: TargetProfile,
): AITargetResponse {
  const weight = profile.weight_kg;
  const macroWeight = weightForMacros(profile);
  const dietType = profile.diet_type ?? 'balanced';
  const bmr =
    profile.gender === 'male'
      ? 10 * weight + 6.25 * profile.height_cm - 5 * profile.age + 5
      : 10 * weight + 6.25 * profile.height_cm - 5 * profile.age - 161;
  const tdee = bmr * activityMultiplier(profile.activity_level);
  const calories = roundToNearest(
    tdee + goalCalorieAdjustment(tdee, profile.goal),
    25,
  );
  const protein = Math.round(macroWeight * proteinMultiplier(profile.goal));

  const carbTarget = carbTargetGrams(dietType, calories);
  let carbs: number;
  let fat: number;
  if (carbTarget === null) {
    // Balanced: fat floored, carbs absorb the remaining calories.
    fat = Math.round(Math.max(macroWeight * 0.6, (calories * 0.25) / 9));
    carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  } else {
    // Low-carb / moderate / keto: carbs pinned, fat absorbs the remainder.
    // The 0.6g/kg fat floor wins ties — if honouring it would overshoot
    // calories, carbs give way (never essential fat).
    carbs = carbTarget;
    fat = Math.round((calories - protein * 4 - carbs * 4) / 9);
    const fatFloor = Math.round(macroWeight * 0.6);
    if (fat < fatFloor) {
      fat = fatFloor;
      carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
    }
  }

  return {
    calorie_target: calories,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    reasoning: `Based on Mifflin-St Jeor estimated maintenance of ${Math.round(
      tdee,
    )} kcal/day, adjusted for ${profile.goal.replace('_', ' ')} with a ${dietTypeLabel(
      dietType,
    )} macro split.`,
  };
}

// Carbohydrate target per diet type, in grams/day. Returns null for the
// 'balanced' default, where carbs remain the residual macro.
//
// The ketosis-relevant tiers (low_carb, keto) are ABSOLUTE grams, not a
// percentage of calories: nutritional ketosis tracks total carb intake, not its
// share of energy, so a percentage would drift in and out of ketosis as the
// calorie target changes. 'moderate' is a balanced-leaning split, so it scales
// with calories. Ranges mirror common ADA/Mayo guidance. See ADR-0006.
function carbTargetGrams(dietType: DietType, calories: number): number | null {
  switch (dietType) {
    case 'balanced':
      return null;
    case 'moderate':
      return Math.round((calories * 0.35) / 4);
    case 'low_carb':
      return 100;
    case 'keto':
      return 25;
  }
}

function dietTypeLabel(dietType: DietType): string {
  switch (dietType) {
    case 'balanced':
      return 'balanced';
    case 'moderate':
      return 'moderate-carb';
    case 'low_carb':
      return 'low-carb';
    case 'keto':
      return 'ketogenic';
  }
}

// Returns the weight to use when computing bodyweight-based macro targets.
// For BMI <= 30 this is the actual bodyweight. For BMI > 30 we use an
// adjusted body weight (ABW = IBW + 0.25 * (actual - IBW)) where IBW is
// calculated from a BMI of 27.5. This is the standard clinical nutrition
// approach for obese patients — prescribing protein based on raw bodyweight
// would yield unrealistic targets (e.g. 315g/day for a 150kg cutter), since
// adipose tissue has minimal protein requirements compared to lean mass.
export function weightForMacros(profile: TargetProfile): number {
  const heightM = profile.height_cm / 100;
  const bmi = profile.weight_kg / (heightM * heightM);
  if (bmi <= 30) return profile.weight_kg;

  const idealWeight = 27.5 * heightM * heightM;
  return idealWeight + 0.25 * (profile.weight_kg - idealWeight);
}

// Recomputes totals from individual items to fix a common LLM error:
// the model sometimes returns items that don't sum to the stated total.
// Per-item macros are also reconciled — see reconcileItem(). All values are
// rounded to 1 decimal place for clean UI display.
//
// Short-circuits for the "not food" response shape (items: []), preserving
// the refusal reason so the UI can render a friendly message. Accepts both
// `null` (from the schema-validated structured output) and `undefined` (from
// legacy callers / tests) for not_food_reason, normalizing to undefined.
// `total` is optional on input: the model no longer returns it (the schema
// dropped it) and any value supplied is ignored in favour of the recompute.
type NormalizableFoodAnalysis = Omit<
  AIFoodAnalysisResponse,
  'not_food_reason' | 'total'
> & {
  total?: AIFoodAnalysisResponse['total'];
  not_food_reason?: string | null;
};

export function normalizeFoodAnalysis(
  response: NormalizableFoodAnalysis,
): AIFoodAnalysisResponse {
  if (response.items.length === 0) {
    return {
      items: [],
      total: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      not_food_reason: response.not_food_reason ?? undefined,
    };
  }

  const items = response.items.map(reconcileItem);

  return {
    items,
    total: {
      calories: roundMacro(sum(items, 'calories')),
      protein_g: roundMacro(sum(items, 'protein_g')),
      carbs_g: roundMacro(sum(items, 'carbs_g')),
      fat_g: roundMacro(sum(items, 'fat_g')),
    },
  };
}

// Reconciles an item's stated calories against the Atwater-derived value
// (protein·4 + carbs·4 + fat·9). LLMs sometimes confabulate calories and
// macros independently, leaving them mathematically inconsistent.
//
// We only correct egregious mismatches (>20% relative or >50 kcal absolute):
// smaller deviations are within the noise of fiber (~2 kcal/g, not 4),
// alcohol (7 kcal/g, not captured in macros at all), and rounding artifacts
// the LLM introduces. The 50 kcal absolute floor avoids over-correcting
// tiny low-cal items like spices.
function reconcileItem(item: AIFoodItem): AIFoodItem {
  const macroDerivedCalories =
    item.protein_g * 4 + item.carbs_g * 4 + item.fat_g * 9;
  const tolerance = Math.max(50, macroDerivedCalories * 0.2);
  const calories =
    Math.abs(item.calories - macroDerivedCalories) > tolerance
      ? macroDerivedCalories
      : item.calories;

  return {
    name: item.name.trim(),
    portion_grams: roundMacro(item.portion_grams),
    calories: roundMacro(calories),
    protein_g: roundMacro(item.protein_g),
    carbs_g: roundMacro(item.carbs_g),
    fat_g: roundMacro(item.fat_g),
  };
}

function activityMultiplier(level: TargetProfile['activity_level']): number {
  const multipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
  };
  return multipliers[level];
}

function goalCalorieAdjustment(
  tdee: number,
  goal: TargetProfile['goal'],
): number {
  switch (goal) {
    case 'bulk':
      return Math.min(500, Math.max(300, tdee * 0.15));
    case 'lean_bulk':
      return Math.min(300, Math.max(150, tdee * 0.08));
    case 'cut':
      return -Math.min(750, Math.max(300, tdee * 0.2));
    case 'recomp':
    case 'maintain':
      return 0;
  }
}

function proteinMultiplier(goal: TargetProfile['goal']): number {
  switch (goal) {
    case 'cut':
    case 'recomp':
      return 2.1;
    case 'bulk':
    case 'lean_bulk':
      return 1.8;
    case 'maintain':
      return 1.9;
  }
}

function roundToNearest(value: number, nearest: number): number {
  return Math.round(value / nearest) * nearest;
}

function roundMacro(value: number): number {
  return Math.round(value * 10) / 10;
}

function sum(
  items: AIFoodAnalysisResponse['items'],
  key: keyof AIFoodAnalysisResponse['total'],
): number {
  return items.reduce((total, item) => total + item[key], 0);
}
