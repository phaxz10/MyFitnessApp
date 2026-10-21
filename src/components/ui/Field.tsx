import type { ReactNode } from 'react';

// Shared label / error / helper chrome for Input, Select and TextArea.

export const CONTROL =
  'w-full rounded-xl bg-surface border px-3 text-base text-ink placeholder:text-ink-3 transition-colors';

export function controlBorder(error?: string) {
  return error ? 'border-danger' : 'border-line-strong';
}

interface FieldProps {
  id?: string;
  label?: string;
  error?: string;
  helperText?: string;
  children: ReactNode;
}

export function Field({ id, label, error, helperText, children }: FieldProps) {
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-semibold text-ink-2 mb-1.5"
        >
          {label}
        </label>
      )}
      {children}
      {error && (
        <p className="mt-1.5 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {helperText && !error && (
        <p className="mt-1.5 text-sm text-ink-3">{helperText}</p>
      )}
    </div>
  );
}

export function fieldId(id: string | undefined, label: string | undefined) {
  return id || label?.toLowerCase().replace(/\s+/g, '-');
}
