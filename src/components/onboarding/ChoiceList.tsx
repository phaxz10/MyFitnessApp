import { Check } from 'lucide-react';

export interface Choice<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface ChoiceListProps<T extends string> {
  label: string;
  options: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
}

// Single-select list of large rows. The chosen row takes the training tint.
export function ChoiceList<T extends string>({
  label,
  options,
  value,
  onChange,
}: ChoiceListProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="space-y-2">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: styled radio row
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            onClick={() => onChange(option.value)}
            className={`w-full min-h-14 px-4 py-3 rounded-xl border flex items-center gap-3 text-left transition-colors ${
              selected
                ? 'border-train bg-train-soft'
                : 'border-line bg-surface hover:border-line-strong'
            }`}
          >
            <span className="flex-1 min-w-0">
              <span
                className={`block font-semibold ${selected ? 'text-train-ink' : 'text-ink'}`}
              >
                {option.label}
              </span>
              {option.description && (
                <span className="block text-sm text-ink-2">
                  {option.description}
                </span>
              )}
            </span>
            {selected && (
              <Check
                size={20}
                className="text-train-ink shrink-0"
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
