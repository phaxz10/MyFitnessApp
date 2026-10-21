import { ChevronRight, Dumbbell, Scale, Utensils } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { DayConsistency } from '../../hooks/useWeeklyConsistency';
import { formatDisplayDate } from '../../utils/date';
import { Modal } from '../ui';

interface DayDetailModalProps {
  day: DayConsistency | null;
  onClose: () => void;
  onLogWeight: (date: string) => void;
  onLogFood: (date: string) => void;
}

function Status({
  label,
  done,
  colour,
}: {
  label: string;
  done: boolean;
  colour: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`size-3 rounded-full ${done ? colour : 'bg-sunken-strong'}`}
      />
      <span className="text-sm text-ink-2">
        {label}
        <span className="sr-only">{done ? ' logged' : ' not logged'}</span>
      </span>
    </div>
  );
}

const ROW =
  'w-full flex items-center gap-3 p-3 rounded-xl border border-line hover:bg-sunken transition-colors text-left';

function ActionBody({
  icon,
  tile,
  title,
  hint,
}: {
  icon: ReactNode;
  tile: string;
  title: string;
  hint: string;
}) {
  return (
    <>
      <span
        className={`grid place-items-center size-11 rounded-lg shrink-0 ${tile}`}
      >
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-ink font-semibold text-sm">{title}</span>
        <span className="block text-ink-2 text-sm">{hint}</span>
      </span>
      <ChevronRight size={18} className="text-ink-3" aria-hidden="true" />
    </>
  );
}

function summaryLine(day: DayConsistency): string {
  if (day.isFuture) return 'Nothing to log yet for this day.';
  const parts: string[] = [];
  if (day.isScheduledWorkoutDay) {
    parts.push(day.hasWorkout ? 'workout done' : 'workout not done');
  }
  parts.push(day.hasFood ? 'food logged' : 'no food logged');
  parts.push(day.hasWeight ? 'weight logged' : 'no weight logged');
  const text = parts.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}

export function DayDetailModal({
  day,
  onClose,
  onLogWeight,
  onLogFood,
}: DayDetailModalProps) {
  const workoutMissing = !!day?.isScheduledWorkoutDay && !day.hasWorkout;
  const allDone = !!day && day.hasWeight && day.hasFood && !workoutMissing;

  return (
    <Modal
      isOpen={day !== null}
      onClose={onClose}
      title={day ? formatDisplayDate(day.date) : ''}
      size="sm"
    >
      {day && (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-4 py-1">
            {day.isScheduledWorkoutDay && (
              <Status label="Workout" done={day.hasWorkout} colour="bg-train" />
            )}
            <Status label="Food" done={day.hasFood} colour="bg-eat" />
            <Status label="Weight" done={day.hasWeight} colour="bg-body" />
          </div>

          <p className="text-center text-ink-2 text-sm">{summaryLine(day)}</p>

          {!allDone && (
            <div className="space-y-2 pt-3 border-t border-line">
              <p className="text-ink-2 text-sm font-semibold">
                {day.isToday ? 'Complete your daily logs' : 'Log missed items'}
              </p>

              {workoutMissing && (
                <Link
                  to={`/workout?date=${day.date}`}
                  onClick={onClose}
                  className={ROW}
                >
                  <ActionBody
                    icon={<Dumbbell size={20} />}
                    tile="bg-train-soft text-train-ink"
                    title="Workout scheduled"
                    hint={
                      day.isToday
                        ? 'Start your workout'
                        : 'Workout was scheduled for this day'
                    }
                  />
                </Link>
              )}

              {!day.hasFood && (
                <button
                  type="button"
                  onClick={() => onLogFood(day.date)}
                  className={ROW}
                >
                  <ActionBody
                    icon={<Utensils size={20} />}
                    tile="bg-eat-soft text-eat-ink"
                    title="Log food"
                    hint="Record meals for this day"
                  />
                </button>
              )}

              {!day.hasWeight && (
                <button
                  type="button"
                  onClick={() => onLogWeight(day.date)}
                  className={ROW}
                >
                  <ActionBody
                    icon={<Scale size={20} />}
                    tile="bg-body-soft text-body-ink"
                    title="Log weight"
                    hint="Record your weight for this day"
                  />
                </button>
              )}
            </div>
          )}

          {allDone && (
            <p className="text-center text-eat-ink text-sm font-medium py-3">
              All logged for this day.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
