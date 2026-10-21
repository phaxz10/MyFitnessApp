import { Check } from 'lucide-react';
import type { WorkoutSetWithExercise } from '../../types';
import { Card, ExerciseMark } from '../ui';

// Past-session exercise with fixed set columns. A completed set is stamped
// (training tint + filled check); a set never completed stays visible with
// a line-through and a "Skipped" tag.

const COLUMNS = 'grid grid-cols-[2.5rem_1fr_1fr_5rem] items-center gap-2';

interface LoggedExerciseCardProps {
  exerciseName: string;
  sets: WorkoutSetWithExercise[];
}

export function LoggedExerciseCard({
  exerciseName,
  sets,
}: LoggedExerciseCardProps) {
  const isTimed = sets.some((s) => s.duration_seconds !== null);
  const doneCount = sets.filter((s) => s.completed_at !== null).length;

  return (
    <Card>
      <div className="flex items-center gap-3 px-4 py-3">
        <ExerciseMark name={exerciseName} size={40} />
        <h3 className="flex-1 min-w-0 font-semibold text-ink truncate">
          {exerciseName}
        </h3>
        <p className="text-sm text-ink-3 shrink-0">
          <span className="num font-semibold text-ink-2">
            {doneCount}/{sets.length}
          </span>{' '}
          sets
        </p>
      </div>

      <div
        className={`${COLUMNS} px-4 py-1.5 border-y border-line text-sm text-ink-3`}
      >
        <span>Set</span>
        <span>Weight</span>
        <span>{isTimed ? 'Time' : 'Reps'}</span>
        <span className="text-right">Done</span>
      </div>

      <ul className="divide-y divide-line">
        {sets.map((set, idx) => (
          <SetRow
            key={set.id}
            set={set}
            setNumber={idx + 1}
            isTimed={isTimed}
          />
        ))}
      </ul>
    </Card>
  );
}

function SetRow({
  set,
  setNumber,
  isTimed,
}: {
  set: WorkoutSetWithExercise;
  setNumber: number;
  isTimed: boolean;
}) {
  const done = set.completed_at !== null;
  const second = isTimed ? set.duration_seconds : set.reps;
  const valueTone = done ? 'text-ink' : 'text-ink-3 line-through';

  return (
    <li
      className={`${COLUMNS} px-4 min-h-12 last:rounded-b-xl ${done ? 'bg-train-soft' : ''}`}
    >
      <span className="num font-semibold text-ink-2">{setNumber}</span>
      <span className={`num text-lg font-bold ${valueTone}`}>
        {set.weight_kg !== null ? (
          <>
            {set.weight_kg}
            <span className="text-sm font-medium text-ink-3 ml-0.5">lbs</span>
          </>
        ) : (
          '–'
        )}
      </span>
      <span className={`num text-lg font-bold ${valueTone}`}>
        {second !== null ? (
          <>
            {second}
            {isTimed && (
              <span className="text-sm font-medium text-ink-3 ml-0.5">s</span>
            )}
          </>
        ) : (
          '–'
        )}
      </span>
      <span className="flex justify-end">
        {done ? (
          <span
            className="grid place-items-center size-7 rounded-full bg-train text-on-accent"
            role="img"
            aria-label="Completed"
          >
            <Check size={16} strokeWidth={3} />
          </span>
        ) : (
          <span className="rounded-full bg-sunken-strong text-ink-2 px-2 py-0.5 text-sm font-semibold">
            Skipped
          </span>
        )}
      </span>
    </li>
  );
}
