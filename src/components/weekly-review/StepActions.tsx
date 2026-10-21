import type { ReactNode } from 'react';
import { Button } from '../ui';

interface StepActionsProps {
  secondaryLabel: string;
  onSecondary: () => void;
  primaryLabel: ReactNode;
  onPrimary: () => void;
  isLoading?: boolean;
  primaryDisabled?: boolean;
}

// Skip / continue pair pinned at the bottom of each step.
export function StepActions({
  secondaryLabel,
  onSecondary,
  primaryLabel,
  onPrimary,
  isLoading,
  primaryDisabled,
}: StepActionsProps) {
  return (
    <div className="flex gap-2 pt-2">
      <Button
        variant="secondary"
        size="lg"
        onClick={onSecondary}
        className="flex-1"
      >
        {secondaryLabel}
      </Button>
      <Button
        size="lg"
        onClick={onPrimary}
        isLoading={isLoading}
        disabled={primaryDisabled}
        className="flex-1"
      >
        {primaryLabel}
      </Button>
    </div>
  );
}
