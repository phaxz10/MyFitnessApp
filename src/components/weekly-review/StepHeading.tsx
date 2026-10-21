import type { ReactNode } from 'react';

interface StepHeadingProps {
  icon: ReactNode;
  title: string;
  /** AI-supplied reason for this step, shown under the title. */
  reason?: string | null;
}

export function StepHeading({ icon, title, reason }: StepHeadingProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid place-items-center size-10 rounded-xl bg-sunken text-ink shrink-0">
        {icon}
      </span>
      <div className="min-w-0">
        <h3 className="text-lg font-bold text-ink">{title}</h3>
        {reason && <p className="text-ink-2 text-sm mt-0.5">{reason}</p>}
      </div>
    </div>
  );
}
