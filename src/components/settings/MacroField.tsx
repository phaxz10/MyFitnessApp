import { forwardRef, type InputHTMLAttributes, useId } from 'react';
import { Input } from '../ui';

export type MacroKey = 'calories' | 'protein' | 'carbs' | 'fat';

// Same colour identity as the rings on CalorieLog, carried by a small dot
// beside the label instead of a border accent on the input.
const MACRO_DOT: Record<MacroKey, string> = {
  calories: 'var(--macro-calories)',
  protein: 'var(--macro-protein)',
  carbs: 'var(--macro-carbs)',
  fat: 'var(--macro-fat)',
};

interface MacroFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  macro: MacroKey;
  label: string;
  error?: string;
}

export const MacroField = forwardRef<HTMLInputElement, MacroFieldProps>(
  function MacroField({ macro, label, error, id, ...props }, ref) {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <div className="w-full">
        <label
          htmlFor={inputId}
          className="flex items-center gap-1.5 text-sm font-semibold text-ink-2 mb-1.5"
        >
          <span
            aria-hidden="true"
            className="size-2 rounded-full shrink-0"
            style={{ background: MACRO_DOT[macro] }}
          />
          {label}
        </label>
        <Input
          ref={ref}
          id={inputId}
          type="number"
          inputMode="decimal"
          error={error}
          className="num"
          {...props}
        />
      </div>
    );
  },
);
