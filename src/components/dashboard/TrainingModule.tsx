import { Check, Play, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import type {
  ProgramExerciseWithDetails,
  ProgramSessionWithExercises,
  WorkoutProgramWithSessions,
} from '../../types';
import { Button, Card, ExerciseMark } from '../ui';
import { ModuleHeading } from './ModuleHeading';

const MAX_ROWS = 6;

function targetLabel(ex: ProgramExerciseWithDetails): string {
  if (ex.target_duration_seconds) {
    return `${ex.target_sets} × ${ex.target_duration_seconds}s`;
  }
  const { target_rep_min: min, target_rep_max: max } = ex;
  if (min && max && min !== max) return `${ex.target_sets} × ${min}–${max}`;
  const reps = min ?? max;
  return reps ? `${ex.target_sets} × ${reps}` : `${ex.target_sets} sets`;
}

interface TrainingModuleProps {
  program: WorkoutProgramWithSessions | null;
  session: ProgramSessionWithExercises | null;
  sessionCompleted: boolean;
  hasActiveWorkout: boolean;
  weeklyWorkouts: number;
  recentPRsCount: number;
  lastWorkout: { name: string; sets: number } | null;
  onStart: () => void;
  onResume: () => void;
  onStartEmpty: () => void;
  onChooseProgram: () => void;
}

export function TrainingModule({
  program,
  session,
  sessionCompleted,
  hasActiveWorkout,
  weeklyWorkouts,
  recentPRsCount,
  lastWorkout,
  onStart,
  onResume,
  onStartEmpty,
  onChooseProgram,
}: TrainingModuleProps) {
  const exercises = session?.exercises ?? [];

  return (
    <Card>
      <div className="px-4 pt-1">
        <ModuleHeading
          discipline="train"
          action={
            <Link
              to="/workout/progress"
              className="text-train-ink text-sm font-semibold hover:underline inline-flex items-center h-11"
            >
              Progress
            </Link>
          }
        >
          Today's training
        </ModuleHeading>
      </div>

      {hasActiveWorkout ? (
        <div className="px-4 pb-4 space-y-3">
          <p className="flex items-center gap-2 text-train-ink font-semibold">
            <span
              className="size-2 rounded-full bg-train animate-pulse"
              aria-hidden="true"
            />
            Workout in progress
          </p>
          <Button size="lg" className="w-full" onClick={onResume}>
            <Play size={18} aria-hidden="true" />
            Resume workout
          </Button>
        </div>
      ) : !program ? (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-ink-2 text-sm">
            No active program. Pick or build one to see today's session here.
          </p>
          <Button
            variant="secondary"
            className="w-full"
            onClick={onChooseProgram}
          >
            Choose a program
          </Button>
        </div>
      ) : !session ? (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-ink font-semibold">Rest day</p>
          <p className="text-ink-2 text-sm">
            No session scheduled in {program.name} today.
          </p>
          <Button variant="secondary" className="w-full" onClick={onStartEmpty}>
            Start empty workout
          </Button>
        </div>
      ) : (
        <div>
          <div className="px-4 pb-3 flex items-baseline justify-between gap-2">
            <p className="text-xl font-bold text-ink">{session.name}</p>
            {sessionCompleted ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-eat-soft text-eat-ink px-2 text-sm font-semibold">
                <Check size={14} aria-hidden="true" />
                Done
              </span>
            ) : (
              <span className="text-ink-3 text-sm truncate">
                {program.name}
              </span>
            )}
          </div>

          {exercises.length > 0 && (
            <ul className="divide-y divide-line border-t border-line">
              {exercises.slice(0, MAX_ROWS).map((ex) => (
                <li key={ex.id} className="flex items-center gap-3 px-4 py-2.5">
                  <ExerciseMark
                    name={ex.exercise_name}
                    muscleGroups={ex.muscle_groups}
                    size={36}
                  />
                  <span className="flex-1 min-w-0 text-ink font-medium truncate">
                    {ex.exercise_name}
                  </span>
                  <span className="num text-ink-2 font-semibold">
                    {targetLabel(ex)}
                  </span>
                </li>
              ))}
              {exercises.length > MAX_ROWS && (
                <li className="px-4 py-2.5 text-ink-3 text-sm">
                  +{exercises.length - MAX_ROWS} more
                </li>
              )}
            </ul>
          )}

          <div className="p-4 space-y-2">
            {sessionCompleted ? (
              <>
                <p className="text-eat-ink text-sm font-medium">
                  Today's session is logged.
                </p>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={onStartEmpty}
                >
                  Start empty workout
                </Button>
              </>
            ) : (
              <Button size="lg" className="w-full" onClick={onStart}>
                <Play size={18} aria-hidden="true" />
                Start workout
              </Button>
            )}
          </div>
        </div>
      )}

      <dl className="grid grid-cols-2 divide-x divide-line border-t border-line">
        <div className="px-4 py-3">
          <dt className="text-ink-2 text-sm">This week</dt>
          <dd className="num text-2xl font-bold text-ink">
            {weeklyWorkouts}
            <span className="text-ink-3 text-sm font-normal">
              {' '}
              {weeklyWorkouts === 1 ? 'workout' : 'workouts'}
            </span>
          </dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-ink-2 text-sm">Recent PRs</dt>
          <dd className="num text-2xl font-bold text-ink flex items-center gap-1.5">
            {recentPRsCount > 0 && (
              <Trophy size={18} className="text-warn" aria-hidden="true" />
            )}
            {recentPRsCount}
          </dd>
        </div>
      </dl>

      {lastWorkout && (
        <p className="px-4 py-3 border-t border-line text-sm text-ink-2">
          Last workout:{' '}
          <span className="text-ink font-medium">{lastWorkout.name}</span>
          <span className="num"> · {lastWorkout.sets} sets</span>
        </p>
      )}
    </Card>
  );
}
