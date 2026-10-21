import { forwardRef, type InputHTMLAttributes } from 'react';
import { CONTROL, controlBorder, Field, fieldId } from './Field';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, helperText, className = '', id, ...props },
  ref,
) {
  const inputId = fieldId(id, label);

  return (
    <Field id={inputId} label={label} error={error} helperText={helperText}>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={`${CONTROL} h-11 ${controlBorder(error)} ${className}`}
        {...props}
      />
    </Field>
  );
});
