import { Check, Loader2, Play, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ExerciseWithSets } from '../../hooks/useWorkoutSession';
import type { WorkoutSet } from '../../types';
import { toDisplayWeight, type WeightUnit } from '../../utils/units';

// Shared building blocks for session set rows (single exercises and superset
// rounds): big condensed numerals in large tap targets, done at the right edge.

export type SetField = 'reps' | 'weight' | 'durationSeconds';

export function exerciseKind(type: ExerciseWithSets['exerciseType']) {
  return {
    isDuration: type === 'duration' || type === 'duration_weight',
    hasWeight: type === 'reps_weight' || type === 'duration_weight',
  };
}

/** "60×8", "45s" or an em dash: last session's value for this set position. */
export function formatPrevious(
  last: WorkoutSet | undefined,
  isDuration: boolean,
  hasWeight: boolean,
  unit: WeightUnit,
): string {
  if (!last) return '—';
  const value = isDuration
    ? last.duration_seconds != null
      ? `${last.duration_seconds}s`
      : null
    : last.reps != null
      ? `${last.reps}`
      : null;
  if (value == null) return '—';
  return hasWeight && last.weight_kg
    ? `${toDisplayWeight(last.weight_kg, unit, 'lift')}×${value}`
    : value;
}

interface NumberCellProps {
  value: string;
  placeholder: string;
  label: string;
  disabled: boolean;
  onChange: (value: string) => void;
  /** Small coaching arrow pinned to the cell corner. */
  hint?: ReactNode;
  size?: 'lg' | 'md';
}

export function NumberCell({
  value,
  placeholder,
  label,
  disabled,
  onChange,
  hint,
  size = 'lg',
}: NumberCellProps) {
  return (
    <div className="relative min-w-0">
      <input
        type="number"
        inputMode="decimal"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.target.select()}
        placeholder={placeholder}
        disabled={disabled}
        className={`num w-full rounded-lg border text-center font-bold transition-colors focus:outline-none ${
          size === 'lg' ? 'h-12 text-2xl' : 'h-11 text-xl'
        } ${
          disabled
            ? 'border-transparent bg-transparent text-train-ink'
            : 'border-line bg-sunken text-ink placeholder:text-ink-3 placeholder:font-normal focus:border-train focus:bg-surface'
        }`}
      />
      {hint && (
        <span className="pointer-events-none absolute -top-1 -right-1">
          {hint}
        </span>
      )}
    </div>
  );
}

interface DoneButtonProps {
  completed: boolean;
  isNext: boolean;
  loading?: boolean;
  label: string;
  onComplete: () => void;
  onUncomplete: () => void;
}

/** Right-edge done square: outline when open, filled stamp when done. */
export function DoneButton({
  completed,
  isNext,
  loading = false,
  label,
  onComplete,
  onUncomplete,
}: DoneButtonProps) {
  return (
    <button
      type="button"
      onClick={completed ? onUncomplete : onComplete}
      disabled={loading}
      aria-pressed={completed}
      aria-label={
        completed ? `${label} done, tap to undo` : `Complete ${label}`
      }
      title={completed ? 'Mark as incomplete to edit' : undefined}
      className={`grid size-12 shrink-0 place-items-center justify-self-end rounded-xl border transition active:scale-95 disabled:opacity-50 ${
        completed
          ? 'border-train bg-train text-on-accent'
          : isNext
            ? 'border-train bg-surface text-train-ink'
            : 'border-line-strong bg-surface text-ink-3'
      }`}
    >
      {loading ? (
        <Loader2 size={22} className="animate-spin" />
      ) : (
        <Check size={24} strokeWidth={completed ? 3 : 2.25} />
      )}
    </button>
  );
}

/** Start a timed hold; sits in the done column for duration exercises. */
export function StartHoldButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Start timer for ${label}`}
      className="grid size-12 shrink-0 place-items-center justify-self-end rounded-xl border border-train bg-surface text-train-ink transition active:scale-95"
    >
      <Play size={22} />
    </button>
  );
}

/** Small toolbar button used under exercise and superset blocks. */
export function ToolButton({
  onClick,
  icon,
  children,
  tone = 'neutral',
  pressed,
  disabled,
}: {
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
  tone?: 'neutral' | 'danger';
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      disabled={disabled}
      className={`inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors disabled:opacity-50 ${
        tone === 'danger'
          ? 'text-danger hover:bg-danger-soft'
          : pressed
            ? 'bg-sunken-strong text-ink'
            : 'text-ink-2 hover:bg-sunken hover:text-ink'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

/** AI coaching note: neutral well with the Sparkles convention. */
export function CoachingTip({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-sunken px-3 py-2 text-sm text-ink-2">
      <Sparkles
        size={16}
        className="mt-0.5 shrink-0 text-ink"
        aria-hidden="true"
      />
      <p>{children}</p>
    </div>
  );
}
