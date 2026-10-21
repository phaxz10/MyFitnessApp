import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

interface StepProgressProps {
  current: number;
  total: number;
}

// Flat segmented bar: one block per step, filled up to the current one.
export function StepProgress({ current, total }: StepProgressProps) {
  return (
    <div
      role="progressbar"
      aria-label="Setup progress"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
      aria-valuetext={`Step ${current} of ${total}`}
      className="flex gap-1 flex-1"
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length static segments
          key={i}
          className={`h-1.5 flex-1 rounded-full ${i < current ? 'bg-train' : 'bg-sunken-strong'}`}
        />
      ))}
    </div>
  );
}

interface OnboardingFrameProps {
  step: number;
  total: number;
  title: string;
  description?: string;
  onBack?: () => void;
  error?: string | null;
  children: ReactNode;
  /** Primary (and optional secondary) actions, pinned to the thumb zone. */
  actions: ReactNode;
}

// Full-screen step layout: progress on top, content, actions pinned below.
export function OnboardingFrame({
  step,
  total,
  title,
  description,
  onBack,
  error,
  children,
  actions,
}: OnboardingFrameProps) {
  return (
    <div className="min-h-dvh bg-canvas flex flex-col">
      <div className="w-full max-w-lg mx-auto px-4 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-3 h-14">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="grid place-items-center size-11 -ml-3 rounded-full text-ink-2 hover:bg-sunken hover:text-ink transition-colors"
            >
              <ArrowLeft size={22} />
            </button>
          ) : (
            <span className="size-11 -ml-3" aria-hidden="true" />
          )}
          <StepProgress current={step} total={total} />
          <p className="num text-sm font-semibold text-ink-2 shrink-0">
            {step} / {total}
          </p>
        </div>
      </div>

      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-4 space-y-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            {title}
          </h1>
          {description && <p className="text-ink-2">{description}</p>}
        </div>
        {children}
        {error && (
          <p role="alert" className="text-danger text-sm font-medium">
            {error}
          </p>
        )}
      </main>

      <footer className="sticky bottom-0 bg-canvas border-t border-line">
        <div className="w-full max-w-lg mx-auto px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] space-y-2">
          {actions}
        </div>
      </footer>
    </div>
  );
}
