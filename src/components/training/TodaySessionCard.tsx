import { CheckCircle2, Link2, Play } from 'lucide-react';
import type { ProgramSessionWithExercises } from '../../types';
import { Button, Card, ExerciseMark } from '../ui';
import { formatRepTarget } from './format';

interface TodaySessionCardProps {
  programName: string;
  session: ProgramSessionWithExercises | null;
  isCompleted: boolean;
  /** Set when logging a missed day (formatted date), null for today. */
  missedDayLabel: string | null;
  onStartSession: (session: ProgramSessionWithExercises) => void;
  onStartEmpty: () => void;
  onEditProgram: () => void;
}

// The Training tab's lead module: today's session as pictogram rows with
// the Start button at thumb height.
export function TodaySessionCard({
  programName,
  session,
  isCompleted,
  missedDayLabel,
  onStartSession,
  onStartEmpty,
  onEditProgram,
}: TodaySessionCardProps) {
  return (
    <Card>
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-ink-2">
            {missedDayLabel
              ? `Workout for ${missedDayLabel}`
              : "Today's Workout"}
          </p>
          <p className="text-sm text-ink-3 truncate">{programName}</p>
        </div>
        {session && (
          <div className="flex items-center gap-2 mt-1">
            <h2 className="text-2xl font-bold text-ink">{session.name}</h2>
            {isCompleted && (
              <span className="inline-flex items-center gap-1 rounded-full bg-eat-soft text-eat-ink px-2 py-0.5 text-sm font-semibold">
                <CheckCircle2 size={14} aria-hidden="true" />
                Completed
              </span>
            )}
          </div>
        )}
      </div>

      {session ? (
        <>
          {session.exercises.length === 0 ? (
            <div className="px-4 py-4 border-t border-line flex items-center justify-between gap-3">
              <p className="text-ink-2">No exercises in this session yet.</p>
              <Button variant="secondary" size="sm" onClick={onEditProgram}>
                Edit program
              </Button>
            </div>
          ) : (
            <ul className="border-t border-line divide-y divide-line">
              {session.exercises.map((ex) => {
                const target = formatRepTarget(
                  ex.target_rep_min,
                  ex.target_rep_max,
                  ex.target_duration_seconds,
                );
                return (
                  <li
                    key={ex.id}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <ExerciseMark
                      name={ex.exercise_name}
                      muscleGroups={ex.muscle_groups}
                      size={40}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-ink truncate">
                        {ex.exercise_name}
                      </p>
                      {ex.superset_group_id && (
                        <p className="flex items-center gap-1 text-sm text-ink-3">
                          <Link2 size={14} aria-hidden="true" />
                          Superset
                        </p>
                      )}
                    </div>
                    <p className="num text-lg font-bold text-ink shrink-0">
                      {ex.target_sets}
                      {target && (
                        <>
                          <span className="text-ink-3 font-medium mx-1">×</span>
                          {target}
                        </>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="p-4 border-t border-line">
            {isCompleted ? (
              <>
                <p className="text-eat-ink text-sm text-center mb-3">
                  {missedDayLabel
                    ? `This workout has already been logged for ${missedDayLabel}.`
                    : "Great job! You've completed today's scheduled workout."}
                </p>
                <Button
                  variant="secondary"
                  size="lg"
                  className="w-full"
                  onClick={onStartEmpty}
                >
                  Start Empty Workout
                </Button>
              </>
            ) : (
              <Button
                size="lg"
                className="w-full"
                onClick={() => onStartSession(session)}
              >
                <Play size={20} aria-hidden="true" />
                {missedDayLabel ? 'Log Missed Workout' : 'Start Workout'}
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="px-4 pb-4">
          <p className="text-xl font-bold text-ink">
            {missedDayLabel ? 'No Session Scheduled' : 'Rest Day'}
          </p>
          <p className="text-ink-2 mt-1 mb-4">
            {missedDayLabel
              ? `No workout was scheduled for ${missedDayLabel}`
              : 'No workout scheduled for today'}
          </p>
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={onStartEmpty}
          >
            Start Empty Workout
          </Button>
        </div>
      )}
    </Card>
  );
}
