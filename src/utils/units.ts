// ---------------------------------------------------------------------------
// Weight units
//
// Storage is always kilograms (every `weight_kg` column, body and lifting).
// The user's display unit lives on user_profile.weight_unit. Convert at the
// UI edge only: toDisplayWeight for anything shown, fromInputWeight for
// anything typed in.
// ---------------------------------------------------------------------------

export type WeightUnit = 'kg' | 'lbs';

/** What a weight measures; sets the display rounding. */
export type WeightKind = 'lift' | 'body' | 'volume';

export const WEIGHT_UNITS: readonly WeightUnit[] = ['kg', 'lbs'];

/** Exact, by definition of the international pound. */
export const KG_PER_LB = 0.45359237;

const STEP: Record<WeightKind, number> = {
  lift: 0.5,
  body: 0.1,
  volume: 1,
};

function roundTo(value: number, step: number): number {
  // Divide/multiply via the reciprocal so 0.1 steps stay clean (82.5 not 82.50000001).
  const inv = 1 / step;
  return Math.round(value * inv) / inv;
}

/** Raw kg -> unit conversion, no rounding. */
export function kgTo(kg: number, unit: WeightUnit): number {
  return unit === 'lbs' ? kg / KG_PER_LB : kg;
}

/** A stored kg value as the number the user should see. */
export function toDisplayWeight(
  kg: number,
  unit: WeightUnit,
  kind: WeightKind = 'lift',
): number {
  return roundTo(kgTo(kg, unit), STEP[kind]);
}

/** A value the user typed (in their unit) as kg for storage. */
export function fromInputWeight(value: number, unit: WeightUnit): number {
  return unit === 'lbs' ? value * KG_PER_LB : value;
}

/**
 * A weight cell's text (display unit) as kg for storage. When the text is
 * exactly what `storedKg` displays as, the stored value is returned
 * untouched, so re-saving an unedited cell never folds display rounding back
 * into storage (100 kg shows as 220.5 lbs; it must stay 100 kg, not
 * 100.017). Empty or invalid text is 0.
 */
export function parseWeightInput(
  text: string | undefined | null,
  unit: WeightUnit,
  storedKg: number | null | undefined,
  kind: WeightKind = 'lift',
): number {
  const trimmed = text?.trim() ?? '';
  if (trimmed === '') return 0;
  if (
    storedKg != null &&
    (trimmed === weightText(storedKg, unit, kind) ||
      trimmed === String(toDisplayWeight(storedKg, unit, kind)))
  ) {
    return storedKg;
  }
  const parsed = parseFloat(trimmed);
  return Number.isNaN(parsed) ? 0 : fromInputWeight(parsed, unit);
}

export function unitLabel(unit: WeightUnit): string {
  return unit;
}

/** The number alone, as text: body weight always shows one decimal. */
export function weightText(
  kg: number,
  unit: WeightUnit,
  kind: WeightKind = 'lift',
): string {
  const value = toDisplayWeight(kg, unit, kind);
  if (kind === 'body') return value.toFixed(1);
  if (kind === 'volume') return value.toLocaleString();
  return String(value);
}

/** "220.5 lbs", "82.5 kg". */
export function formatWeight(
  kg: number,
  unit: WeightUnit,
  kind: WeightKind = 'lift',
): string {
  return `${weightText(kg, unit, kind)} ${unitLabel(unit)}`;
}

export function isWeightUnit(value: unknown): value is WeightUnit {
  return value === 'kg' || value === 'lbs';
}
