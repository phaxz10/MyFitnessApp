# ADR-0006 — Diet Type selects the carb strategy; fat is the residual for low-carb

- **Status**: Accepted
- **Date**: 2026-06-08
- **Deciders**: JP (@phaxz)

## Context

Macro targets are computed deterministically in `calculateDeterministicTargets` (`src/services/coaching/nutritionCoach.ts`): Mifflin-St Jeor BMR → activity multiplier → goal calorie adjustment → macro split. The AI layer only writes a prose explanation of these numbers; it never changes them (ADR-0005's coaches read, they don't compute targets).

The original split set **protein** from bodyweight (1.8–2.1 g/kg by goal), **fat** at a floor of `max(0.6 g/kg, 25% of calories)`, and let **carbs absorb the remaining calories**. Carbs were the *residual bucket*. Because protein and fat are bounded, carbs structurally land high — a recomp plan at ~1800 kcal lands carbs near 60% of intake, above even the "moderate carb" tier in common ADA/Mayo guidance (moderate 26–45%, low 10–25% / 50–130 g, keto <10% / 20–50 g).

There was no way to express a low-carb or ketogenic plan. The targets-form validation even floored carbs at `min(50)` g, which would *reject* keto-level carbs (20–50 g) entered by hand. Users managing insulin / metabolic health (the motivating request) could not get the app to produce a plan that matched their diet.

## Decision

**Add a `diet_type` (carb strategy) to the Profile. It chooses which macro is the residual.**

1. **Four tiers, mirroring the guidance.** `balanced | moderate | low_carb | keto` (`DietType` in `src/types/index.ts`). `balanced` is the legacy default.

2. **The residual flips by tier.** For `balanced`, behaviour is unchanged — fat is floored, carbs absorb the remainder. For `moderate | low_carb | keto`, **carbs are pinned to a target and fat absorbs the remainder**, with a `0.6 g/kg` essential-fat floor that wins ties (if honouring it would overshoot calories, carbs give way — never essential fat). Protein is bodyweight-driven in every case.

3. **Carb targets: absolute grams for the ketosis-relevant tiers, percentage for moderate.** `keto = 25 g/day`, `low_carb = 100 g/day`, `moderate = 35% of calories`. Nutritional ketosis tracks *total* carb intake, not its share of energy, so a percentage would drift in and out of ketosis as the calorie target changes — keto/low-carb must be grams. `moderate` is a balanced-leaning split, so it scales with calories. See `carbTargetGrams`.

4. **Behaviour-preserving migration.** Migration v4 (`src/services/migrator.ts`) adds `diet_type TEXT NOT NULL DEFAULT 'balanced'` (CHECK-constrained to the four). Existing rows and pre-feature backups (`src/services/backup.ts` restore) backfill to `balanced`, so current users see no change in their targets.

5. **The coaches respect it.** The Weekly Review prompt (`src/services/coaching/weeklyReviewCoach.ts`) now states the user's `diet_type` and is instructed to keep carbs within strategy for keto/low-carb (adjust calories via fat, no high-carb refeeds) — so the check-in can't quietly recommend the user out of ketosis.

6. **Carbs floor lowered to 20 g** in `onboardingTargetsSchema` so keto-level targets validate.

The user picks Diet Type in onboarding (goal step) and Settings (goals form); both read `dietTypeOptions` from `src/constants/options.ts`. Onboarding shows a one-line note that keto is therapeutic and worth discussing with a doctor.

## Consequences

- **Positive**: The app can express the full carb spectrum from balanced to ketogenic, computed deterministically and unit-tested per tier.
- **Positive**: Backward compatible — `balanced` reproduces the exact prior numbers; the existing target tests are unchanged.
- **Positive**: One dimension (`diet_type`) drives the split; the AI explanation and weekly review inherit it for free.
- **Negative**: The macro split now has two code paths (residual carbs vs residual fat). Mitigated by the shared protein/floor logic and explicit per-tier tests, including the fat-floor clamp case.
- **Negative**: The fixed keto/low-carb grams don't scale with bodyweight. Accepted — ketosis is about absolute carbs, and the values sit inside the standard therapeutic ranges; a future tier could expose a custom gram target if needed.
- **Health note**: Keto/very-low-carb is a therapeutic approach. The app surfaces a non-blocking caveat but is not medical advice; this ADR records a *macro-math* decision, not a clinical endorsement.

## Alternatives considered

- **Flip the global default to low-carb.** Rejected — silently changes everyone's plan and hard-codes one dietary philosophy; `diet_type` keeps `balanced` the default and makes the choice explicit.
- **Express every tier as a percentage of calories.** Rejected — a percentage keto target drifts in and out of ketosis as calories change; the ketosis-relevant tiers must be absolute grams.
- **Let the AI choose the split from a free-text diet description.** Rejected — targets must stay deterministic and testable (ADR-0005); the AI explains numbers, it doesn't compute them.

## Re-litigation guard

Do not re-suggest making carbs the universal residual, nor folding keto into a percentage target. The residual flips by `diet_type` on purpose, and keto/low-carb are grams on purpose. Add a tier by extending the `DietType` union, `dietTypeOptions`, the migration CHECK, and `carbTargetGrams` — not by special-casing call sites.
