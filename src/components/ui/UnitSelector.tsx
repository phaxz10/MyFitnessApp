import { unitLabel, WEIGHT_UNITS, type WeightUnit } from '../../utils/units';

interface UnitSelectorProps {
  value: WeightUnit;
  onChange: (unit: WeightUnit) => void;
  className?: string;
  /** Discipline colour of the selected segment. Defaults to train. */
  tone?: 'train' | 'body';
}

const ACTIVE_TONE = {
  train: 'bg-train text-on-accent',
  body: 'bg-body text-on-accent',
};

/** kg / lbs segmented control, same anatomy as TimeRangeSelector. */
export function UnitSelector({
  value,
  onChange,
  className = '',
  tone = 'train',
}: UnitSelectorProps) {
  return (
    <fieldset
      className={`m-0 flex min-w-0 gap-1 rounded-xl border-0 bg-sunken p-1 ${className}`}
      aria-label="Weight unit"
    >
      {WEIGHT_UNITS.map((unit) => (
        <button
          key={unit}
          type="button"
          onClick={() => onChange(unit)}
          aria-pressed={value === unit}
          className={`flex-1 h-10 px-4 rounded-lg text-sm font-semibold transition-colors ${
            value === unit ? ACTIVE_TONE[tone] : 'text-ink-2 hover:text-ink'
          }`}
        >
          {unitLabel(unit)}
        </button>
      ))}
    </fieldset>
  );
}
