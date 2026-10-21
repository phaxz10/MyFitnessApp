import type { ReactNode } from 'react';

// Single-choice option for the AI wizard. Selected state is neutral ink.

interface OptionButtonProps {
  selected: boolean;
  onSelect: () => void;
  title: ReactNode;
  description?: string;
}

export function OptionButton({
  selected,
  onSelect,
  title,
  description,
}: OptionButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`w-full min-h-11 px-4 py-3 rounded-xl text-left transition-colors ${
        selected
          ? 'bg-ink text-canvas'
          : 'bg-sunken text-ink hover:bg-sunken-strong'
      }`}
    >
      <span className="block font-semibold">{title}</span>
      {description && (
        <span
          className={`block text-sm ${selected ? 'opacity-80' : 'text-ink-2'}`}
        >
          {description}
        </span>
      )}
    </button>
  );
}

/** Compact numeric choice (days per week, minutes). */
export function NumberOption({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`num h-12 rounded-xl text-lg font-bold transition-colors ${
        selected
          ? 'bg-ink text-canvas'
          : 'bg-sunken text-ink-2 hover:bg-sunken-strong hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

/** Question heading inside a wizard step. */
export function StepQuestion({
  icon,
  children,
}: {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <h3 className="flex items-center gap-2 font-semibold text-ink mb-3">
      {icon && (
        <span className="text-ink-2" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </h3>
  );
}
