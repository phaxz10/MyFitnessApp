import { ChevronDown } from 'lucide-react';
import { forwardRef, type SelectHTMLAttributes } from 'react';
import { CONTROL, controlBorder, Field, fieldId } from './Field';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    { label, error, options, placeholder, className = '', id, ...props },
    ref,
  ) {
    const selectId = fieldId(id, label);

    return (
      <Field id={selectId} label={label} error={error}>
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            aria-invalid={error ? true : undefined}
            className={`${CONTROL} h-11 pr-10 appearance-none cursor-pointer ${controlBorder(error)} ${className}`}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={18}
            aria-hidden="true"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none"
          />
        </div>
      </Field>
    );
  },
);
