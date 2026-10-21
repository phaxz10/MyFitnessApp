import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  /** Discipline colour for primary buttons; `ink` marks AI actions. */
  tone?: 'train' | 'eat' | 'body' | 'ink';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  isLoading?: boolean;
}

const PRIMARY_TONE = {
  train: 'bg-train text-on-accent hover:brightness-110',
  eat: 'bg-eat text-on-accent hover:brightness-110',
  body: 'bg-body text-on-accent hover:brightness-110',
  ink: 'bg-ink text-canvas hover:opacity-90',
};

const VARIANT = {
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-sunken',
  danger: 'bg-danger text-on-accent hover:brightness-110',
  ghost: 'bg-transparent text-ink-2 hover:bg-sunken hover:text-ink',
};

const SIZE = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-base gap-2',
  lg: 'h-13 px-5 text-lg gap-2',
};

export function Button({
  variant = 'primary',
  tone = 'train',
  size = 'md',
  children,
  isLoading = false,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  const colour = variant === 'primary' ? PRIMARY_TONE[tone] : VARIANT[variant];

  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl font-semibold transition active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none ${colour} ${SIZE[size]} ${className}`}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading && (
        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
