import type { ReactNode } from 'react';

// Multi-select chip with a 44px touch target. AI flows use the ink fill.

interface ToggleChipProps {
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function ToggleChip({ selected, onToggle, children }: ToggleChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={`h-11 px-3 rounded-lg text-sm font-medium transition-colors ${
        selected
          ? 'bg-ink text-canvas'
          : 'bg-sunken text-ink-2 hover:bg-sunken-strong hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
