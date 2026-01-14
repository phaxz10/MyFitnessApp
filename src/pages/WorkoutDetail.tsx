import {
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  Dumbbell,
  Edit2,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, CardContent, Modal } from '../components/ui';
import { useWorkoutLogs } from '../hooks/useWorkoutLogs';
import { getDB } from '../services/db';
import type { WorkoutLog, WorkoutSetWithExercise } from '../types';
import { parseLocalTimestamp } from '../utils/date';

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
        [parseInt(id)],
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
        [parseInt(id)],
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
    const mins = Math.floor(diffMs / 60000);

    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
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

    const mins = parseInt(durationMinutes);
    if (isNaN(mins) || mins <= 0) return;

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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!workout) {
    return (
      <div className="p-4">
        <p className="text-slate-400 text-center">Workout not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/workout')}
              className="p-2 -ml-2 text-slate-400 hover:text-white"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white">
                {workout.session_name || 'Quick Workout'}
              </h1>
              {workout.program_name && (
                <p className="text-sm text-slate-400">{workout.program_name}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {workout.session_id && (
              <button
                type="button"
                onClick={() => setShowRelogModal(true)}
                className="p-2 text-slate-400 hover:text-blue-400"
                title="Re-log this workout"
              >
                <RotateCcw size={20} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="p-2 text-slate-400 hover:text-red-400"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Workout Info */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-blue-400" />
                <div>
                  <p className="text-xs text-slate-400">Date</p>
                  <p className="text-white text-sm">
                    {formatDate(workout.date)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Clock size={18} className="text-green-400" />
                <div>
                  <p className="text-xs text-slate-400">Time</p>
                  <p className="text-white text-sm">
                    {formatTime(workout.started_at)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 col-span-2">
                <Clock size={18} className="text-purple-400" />
                <div className="flex-1">
                  <p className="text-xs text-slate-400">Duration</p>
                  {isEditingDuration ? (
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="number"
                        value={durationMinutes}
                        onChange={(e) => setDurationMinutes(e.target.value)}
                        className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                        placeholder="mins"
                        min="1"
                      />
                      <span className="text-slate-400 text-sm">minutes</span>
                      <button
                        type="button"
                        onClick={handleSaveDuration}
                        className="p-1 text-green-400 hover:text-green-300"
                      >
                        <Check size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingDuration(false)}
                        className="p-1 text-slate-400 hover:text-white"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-white text-sm">
                        {formatDuration(workout.started_at, workout.ended_at)}
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsEditingDuration(true)}
                        className="p-1 text-slate-400 hover:text-blue-400"
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 col-span-2">
                <Dumbbell size={18} className="text-orange-400" />
                <div>
                  <p className="text-xs text-slate-400">Total Sets</p>
                  <p className="text-white text-sm">
                    {workout.sets.length} sets
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        {workout.notes && (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-slate-400 mb-1">Notes</p>
              <p className="text-white text-sm">{workout.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Exercises */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Exercises</h2>

          {Object.values(exerciseGroups || {}).length === 0 ? (
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-slate-400">No exercises logged</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {Object.values(exerciseGroups || {}).map((group) => (
                <Card key={group.exerciseId}>
                  <CardContent className="p-4">
                    <h3 className="font-medium text-white mb-3">
                      {group.exerciseName}
                    </h3>
                    <div className="space-y-2">
                      {group.sets.map((set, idx) => (
                        <div
                          key={set.id}
                          className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0"
                        >
                          <span className="text-slate-400 text-sm">
                            Set {idx + 1}
                          </span>
                          <div className="text-white text-sm">
                            {set.duration_seconds !== null ? (
                              <span>{set.duration_seconds}s</span>
                            ) : (
                              <>
                                {set.weight_kg !== null && (
                                  <span>{set.weight_kg} lbs</span>
                                )}
                                {set.weight_kg !== null &&
                                  set.reps !== null && (
                                    <span className="text-slate-400 mx-1">
                                      x
                                    </span>
                                  )}
                                {set.reps !== null && (
                                  <span>{set.reps} reps</span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Workout"
      >
        <p className="text-slate-300 mb-6">
          Are you sure you want to delete this workout? This action cannot be
          undone.
        </p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setShowDeleteModal(false)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700"
            onClick={handleDeleteWorkout}
          >
            Delete
          </Button>
        </div>
      </Modal>

      {/* Re-log Confirmation Modal */}
      <Modal
        isOpen={showRelogModal}
        onClose={() => setShowRelogModal(false)}
        title="Re-log Workout"
      >
        <p className="text-slate-300 mb-6">
          This will delete the current workout data and start a fresh workout
          session with the same exercises. Use this to re-enter your workout
          data correctly.
        </p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setShowRelogModal(false)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700"
            onClick={handleRelogWorkout}
          >
            <RotateCcw size={18} className="mr-2" />
            Re-log
          </Button>
        </div>
      </Modal>
    </div>
  );
}
