import { Check, Edit2, RotateCcw, Trash2, X } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LoggedExerciseCard } from '../components/training/LoggedExerciseCard';
import {
  BandIconButton,
  SubpageHeader,
} from '../components/training/SubpageHeader';
import { Card, ConfirmModal, SkeletonCard } from '../components/ui';
import { useWorkoutLogs } from '../hooks/useWorkoutLogs';
import { getDB } from '../services/db';
import type { WorkoutLog, WorkoutSetWithExercise } from '../types';
import { parseLocalTimestamp } from '../utils/date';
import { formatDurationFromMs } from '../utils/formatters';

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="px-4 py-3 min-w-0">
      <p className="text-sm text-ink-3">{label}</p>
      <div className="num text-xl font-bold text-ink truncate">{children}</div>
    </div>
  );
}

interface WorkoutLogWithDetails extends WorkoutLog {
  session_name?: string;
  program_name?: string;
  sets: WorkoutSetWithExercise[];
}

export function WorkoutDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { startWorkout, deleteLog } = useWorkoutLogs();
  const [workout, setWorkout] = useState<WorkoutLogWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditingDuration, setIsEditingDuration] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRelogModal, setShowRelogModal] = useState(false);

  const fetchWorkout = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    try {
      const db = await getDB();

      // Fetch workout log with session and program names
      const result = await db.query(
        `SELECT wl.*, ps.name as session_name, wp.name as program_name
         FROM workout_logs wl
         LEFT JOIN program_sessions ps ON wl.session_id = ps.id
         LEFT JOIN workout_programs wp ON wl.program_id = wp.id
         WHERE wl.id = $1`,
        [parseInt(id, 10)],
      );

      if ((result.rows as WorkoutLog[]).length === 0) {
        navigate('/workout');
        return;
      }

      const log = (
        result.rows as (WorkoutLog & {
          session_name?: string;
          program_name?: string;
        })[]
      )[0];

      // Fetch sets for this workout
      const setsResult = await db.query(
        `SELECT ws.*, e.name as exercise_name
         FROM workout_sets ws
         JOIN exercises e ON ws.exercise_id = e.id
         WHERE ws.workout_log_id = $1
         ORDER BY ws.created_at`,
        [parseInt(id, 10)],
      );

      const workoutWithSets: WorkoutLogWithDetails = {
        ...log,
        sets: setsResult.rows as WorkoutSetWithExercise[],
      };

      setWorkout(workoutWithSets);

      // Calculate current duration for the edit input
      if (log.ended_at) {
        const start = parseLocalTimestamp(log.started_at);
        const end = parseLocalTimestamp(log.ended_at);
        const diffMs = end.getTime() - start.getTime();
        const mins = Math.round(diffMs / 60000);
        setDurationMinutes(mins.toString());
      } else {
        // Default to 60 minutes if no end time
        setDurationMinutes('60');
      }
    } catch (err) {
      console.error('Failed to fetch workout:', err);
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchWorkout();
  }, [fetchWorkout]);

  const formatDuration = (startedAt: string, endedAt: string | null) => {
    if (!endedAt) return 'In progress';

    const start = parseLocalTimestamp(startedAt);
    const end = parseLocalTimestamp(endedAt);
    const diffMs = end.getTime() - start.getTime();
    return formatDurationFromMs(diffMs);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (timestamp: string) => {
    const date = parseLocalTimestamp(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const handleSaveDuration = async () => {
    if (!workout || !durationMinutes) return;

    const mins = parseInt(durationMinutes, 10);
    if (Number.isNaN(mins) || mins <= 0) return;

    try {
      const db = await getDB();

      // Calculate new ended_at based on started_at + duration
      const start = parseLocalTimestamp(workout.started_at);
      const newEnd = new Date(start.getTime() + mins * 60000);

      // Format as local ISO string (same format as getLocalTimestamp)
      const tzOffset = newEnd.getTimezoneOffset() * 60000;
      const localISOString = new Date(newEnd.getTime() - tzOffset)
        .toISOString()
        .slice(0, -1);

      await db.query('UPDATE workout_logs SET ended_at = $1 WHERE id = $2', [
        localISOString,
        workout.id,
      ]);

      setWorkout({ ...workout, ended_at: localISOString });
      setIsEditingDuration(false);
    } catch (err) {
      console.error('Failed to update duration:', err);
    }
  };

  const handleDeleteWorkout = async () => {
    if (!workout) return;

    try {
      const db = await getDB();
      await db.query('DELETE FROM workout_logs WHERE id = $1', [workout.id]);
      navigate('/workout');
    } catch (err) {
      console.error('Failed to delete workout:', err);
    }
  };

  const handleRelogWorkout = async () => {
    if (!workout) return;

    try {
      // Delete the old workout using the hook (handles cleanup properly)
      await deleteLog(workout.id);

      // Extract just the YYYY-MM-DD part from the date
      // PGlite may return Date object or string, so handle both
      const dateValue = workout.date as unknown;
      const workoutDate =
        dateValue instanceof Date
          ? dateValue.toISOString().split('T')[0]
          : String(dateValue).substring(0, 10);

      // Start a new workout with the same program/session and the SAME DATE
      // This uses the proper startWorkout which:
      // - Creates workout_log_exercises
      // - Pre-creates workout_sets
      // - Sets appropriate started_at time
      await startWorkout(
        workout.program_id,
        workout.session_id,
        workoutDate, // Preserve the original workout date (YYYY-MM-DD)
      );

      // Navigate to workout session with the date parameter
      navigate(`/workout/session?date=${workoutDate}`);
    } catch (err) {
      console.error('Failed to re-log workout:', err);
    }
  };

  // Group sets by exercise
  const exerciseGroups = workout?.sets.reduce(
    (acc, set) => {
      const key = set.exercise_id;
      if (!acc[key]) {
        acc[key] = {
          exerciseId: set.exercise_id,
          exerciseName: set.exercise_name,
          sets: [],
        };
      }
      acc[key].sets.push(set);
      return acc;
    },
    {} as Record<
      number,
      {
        exerciseId: number;
        exerciseName: string;
        sets: WorkoutSetWithExercise[];
      }
    >,
  );

  if (loading) {
    return (
      <div className="px-4 py-4 space-y-4" aria-busy="true">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!workout) {
    return (
      <div className="px-4 py-4">
        <p className="text-ink-2 text-center">Workout not found</p>
      </div>
    );
  }

  const groups = Object.values(exerciseGroups || {});

  return (
    <div>
      <SubpageHeader
        title={workout.session_name || 'Quick Workout'}
        subtitle={workout.program_name}
        onBack={() => navigate('/workout')}
        actions={
          <>
            {workout.session_id && (
              <BandIconButton
                label="Re-log this workout"
                onClick={() => setShowRelogModal(true)}
              >
                <RotateCcw size={20} />
              </BandIconButton>
            )}
            <BandIconButton
              label="Delete workout"
              onClick={() => setShowDeleteModal(true)}
            >
              <Trash2 size={20} />
            </BandIconButton>
          </>
        }
      />

      <div className="px-4 py-4 space-y-4">
        {/* Session summary */}
        <Card>
          <p className="px-4 pt-3.5 pb-3 text-lg font-bold text-ink border-b border-line">
            {formatDate(workout.date)}
          </p>
          <div className="grid grid-cols-3 divide-x divide-line">
            <Stat label="Started">{formatTime(workout.started_at)}</Stat>
            <button
              type="button"
              onClick={() => setIsEditingDuration(true)}
              aria-label="Edit duration"
              aria-expanded={isEditingDuration}
              className={`min-w-0 text-left transition-colors hover:bg-sunken ${isEditingDuration ? 'bg-sunken' : ''}`}
            >
              <Stat label="Duration">
                <span className="inline-flex items-center gap-1.5">
                  {formatDuration(workout.started_at, workout.ended_at)}
                  <Edit2
                    size={14}
                    className="text-ink-3 shrink-0"
                    aria-hidden="true"
                  />
                </span>
              </Stat>
            </button>
            <Stat label="Sets">{workout.sets.length}</Stat>
          </div>

          {isEditingDuration && (
            <div className="flex items-center gap-2 px-4 py-3 border-t border-line">
              <label htmlFor="duration-minutes" className="sr-only">
                Duration in minutes
              </label>
              <input
                id="duration-minutes"
                type="number"
                inputMode="numeric"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className="num w-24 h-11 px-3 rounded-xl bg-surface border border-line-strong text-base text-ink text-center"
                placeholder="mins"
                min="1"
              />
              <span className="text-ink-2 flex-1">minutes</span>
              <button
                type="button"
                onClick={handleSaveDuration}
                aria-label="Save duration"
                className="grid place-items-center size-11 rounded-xl bg-train text-on-accent"
              >
                <Check size={20} />
              </button>
              <button
                type="button"
                onClick={() => setIsEditingDuration(false)}
                aria-label="Cancel editing duration"
                className="grid place-items-center size-11 rounded-xl text-ink-2 hover:bg-sunken"
              >
                <X size={20} />
              </button>
            </div>
          )}
        </Card>

        {/* Notes */}
        {workout.notes && (
          <Card>
            <div className="px-4 py-3">
              <p className="text-sm font-semibold text-ink-2 mb-1">Notes</p>
              <p className="text-ink">{workout.notes}</p>
            </div>
          </Card>
        )}

        {/* Exercises */}
        <section className="space-y-2 pt-2">
          <h2 className="text-lg font-bold text-ink">Exercises</h2>
          {groups.length === 0 ? (
            <Card>
              <p className="p-4 text-ink-2">No exercises logged</p>
            </Card>
          ) : (
            groups.map((group) => (
              <LoggedExerciseCard
                key={group.exerciseId}
                exerciseName={group.exerciseName}
                sets={group.sets}
              />
            ))
          )}
        </section>
      </div>

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Workout"
        confirmLabel="Delete"
        onConfirm={handleDeleteWorkout}
        danger
      >
        Are you sure you want to delete this workout? This action cannot be
        undone.
      </ConfirmModal>

      <ConfirmModal
        isOpen={showRelogModal}
        onClose={() => setShowRelogModal(false)}
        title="Re-log Workout"
        confirmLabel={
          <>
            <RotateCcw size={18} aria-hidden="true" />
            Re-log
          </>
        }
        onConfirm={handleRelogWorkout}
      >
        This will delete the current workout data and start a fresh workout
        session with the same exercises. Use this to re-enter your workout data
        correctly.
      </ConfirmModal>
    </div>
  );
}
