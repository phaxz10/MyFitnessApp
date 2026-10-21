import { Input } from '../ui';

export interface TargetValues {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const ROWS: {
  key: keyof TargetValues;
  label: string;
  unit: string;
  dot: string;
}[] = [
  {
    key: 'calories',
    label: 'Daily Calories',
    unit: 'kcal',
    dot: 'var(--macro-calories)',
  },
  { key: 'protein', label: 'Protein', unit: 'g', dot: 'var(--macro-protein)' },
  { key: 'carbs', label: 'Carbs', unit: 'g', dot: 'var(--macro-carbs)' },
  { key: 'fat', label: 'Fat', unit: 'g', dot: 'var(--macro-fat)' },
];

interface TargetsEditorProps {
  values: TargetValues;
  onChange: (next: TargetValues) => void;
}

// Ruled rows: macro dot + label on the left, editable number on the right.
export function TargetsEditor({ values, onChange }: TargetsEditorProps) {
  return (
    <div className="bg-surface border border-line rounded-xl divide-y divide-line">
      {ROWS.map(({ key, label, unit, dot }) => (
        <div
          key={key}
          className="flex items-center justify-between gap-3 px-4 py-2"
        >
          <label
            htmlFor={`target-${key}`}
            className="flex items-center gap-2 text-ink font-semibold"
          >
            <span
              aria-hidden="true"
              className="size-2 rounded-full shrink-0"
              style={{ background: dot }}
            />
            {label}
          </label>
          <div className="flex items-center gap-2">
            <div className="w-28">
              <Input
                id={`target-${key}`}
                type="number"
                inputMode="numeric"
                value={values[key]}
                onChange={(e) =>
                  onChange({
                    ...values,
                    [key]: parseInt(e.target.value, 10) || 0,
                  })
                }
                className="num text-right text-lg font-bold"
              />
            </div>
            <span className="text-ink-3 text-sm w-8">{unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
