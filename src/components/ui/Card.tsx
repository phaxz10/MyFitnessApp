import type { ReactNode } from 'react';

// Hairline-ruled module: one border, no shadow, 12px radius.

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

const MODULE = 'bg-surface rounded-xl border border-line';

export function Card({ children, className = '', onClick }: CardProps) {
  if (onClick) {
    return (
      <button
        type="button"
        className={`${MODULE} text-left w-full transition-colors hover:border-line-strong active:bg-sunken ${className}`}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }

  return <div className={`${MODULE} ${className}`}>{children}</div>;
}

interface SlotProps {
  children: ReactNode;
  className?: string;
}

export function CardHeader({ children, className = '' }: SlotProps) {
  return (
    <div className={`px-4 pt-3.5 pb-2 border-b border-line ${className}`}>
      {children}
    </div>
  );
}

export function CardContent({ children, className = '' }: SlotProps) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }: SlotProps) {
  return (
    <h3 className={`text-base font-bold text-ink ${className}`}>{children}</h3>
  );
}
