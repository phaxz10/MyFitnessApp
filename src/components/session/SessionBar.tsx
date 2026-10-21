import { X } from 'lucide-react';
import { formatElapsedTime } from '../../utils/formatters';

interface SessionBarProps {
  elapsedSeconds: number;
  completedSets: number;
  exerciseCount: number;
  onCancel: () => void;
  onFinish: () => void;
}

// Training-blue band for the live session: elapsed time and the two exits.
// Both exits open a confirmation, so a stray tap never ends the workout.
export function SessionBar({
  elapsedSeconds,
  completedSets,
  exerciseCount,
  onCancel,
  onFinish,
}: SessionBarProps) {
  return (
    <header className="sticky top-0 z-30 bg-train pt-[env(safe-area-inset-top)] text-on-accent">
      <div className="mx-auto flex h-16 max-w-lg items-center gap-2 px-2">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel workout"
          className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-white/15"
        >
          <X size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2">
            <span className="num text-3xl font-bold leading-none" role="timer">
              {formatElapsedTime(elapsedSeconds)}
            </span>
            <span className="truncate text-sm opacity-90">
              <span className="num font-semibold">{completedSets}</span> sets ·{' '}
              <span className="num font-semibold">{exerciseCount}</span>{' '}
              exercises
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onFinish}
          className="h-11 shrink-0 rounded-xl bg-surface px-4 text-base font-semibold text-train-ink"
        >
          Finish
        </button>
      </div>
    </header>
  );
}
