import { forwardRef, type InputHTMLAttributes } from 'react';

// Compact numeric field for set/rep targets: 44px tall, 16px condensed digits.
// The shared Input is full-width by design, so this lives here.

export const NumberInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function NumberInput({ className = 'w-14', ...props }, ref) {
  return (
    <input
      ref={ref}
      type="number"
      inputMode="numeric"
      className={`num h-11 px-1 rounded-lg bg-surface border border-line-strong text-base font-semibold text-ink text-center placeholder:text-ink-3 ${className}`}
      {...props}
    />
  );
});
