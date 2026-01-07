import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  Plus,
  Check,
  Trash2,
  Timer,
  ChevronDown,
  ChevronUp,
  X,
  Save,
  Play,
  Pause,
  RotateCcw,
  Dumbbell,
  Clock,
} from 'lucide-react';
import {
  Card,
  CardContent,
  Button,
  Input,
  Modal,
  TextArea,
} from '../components/ui';
import { RestTimer } from '../components/workout';
import { useWorkoutLogs } from '../hooks/useWorkoutLogs';
import { useWorkoutPrograms } from '../hooks/useWorkoutPrograms';
import { useExercises } from '../hooks/useExercises';
import {
  workoutNotesSchema,
  type WorkoutNotesFormData,
} from '../schemas/forms';
import type {
  Exercise,
  ProgramExerciseWithDetails,
  WorkoutSet,
  ExerciseType,
} from '../types';

interface SetData {
  id?: number;
  tempId: string;
  reps: string;
  weight: string;
  durationSeconds: string;
  completed: boolean;
}

interface ExerciseWithSets {
  exercise: Exercise | ProgramExerciseWithDetails;
  exerciseType: ExerciseType;
  sets: SetData[];
  lastPerformance: WorkoutSet[] | null;
  isExpanded: boolean;
  supersetGroupId?: string | null;
}

// Duration Timer Component
function DurationTimer({
  targetSeconds,
  onComplete,
  onCancel,
}: {
  targetSeconds: number;
  onComplete: (actualSeconds: number) => void;
  onCancel: () => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const progress = Math.min((seconds / targetSeconds) * 100, 100);
  const isOverTarget = seconds >= targetSeconds;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <div className="w-full max-w-sm bg-slate-800 rounded-2xl p-6">
        <div className="text-center mb-6">
          <p className="text-slate-400 text-sm mb-2">
            Target: {formatTime(targetSeconds)}
          </p>
          <p
            className={`text-5xl font-mono font-bold ${isOverTarget ? 'text-green-400' : 'text-white'}`}
          >
            {formatTime(seconds)}
          </p>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-slate-700 rounded-full mb-6 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${isOverTarget ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              setIsRunning(false);
              setSeconds(0);
            }}
          >
            <RotateCcw size={18} className="mr-2" />
            Reset
          </Button>

          {!isRunning ? (
            <Button className="flex-1" onClick={() => setIsRunning(true)}>
              <Play size={18} className="mr-2" />
              {seconds > 0 ? 'Resume' : 'Start'}
            </Button>
          ) : (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setIsRunning(false)}
            >
              <Pause size={18} className="mr-2" />
              Pause
            </Button>
          )}
        </div>

        <div className="flex gap-3 mt-3">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="flex-1 bg-green-600 hover:bg-green-700"
            onClick={() => {
              setIsRunning(false);
              onComplete(seconds);
            }}
            disabled={seconds === 0}
          >
            <Check size={18} className="mr-2" />
            Complete
          </Button>
        </div>
      </div>
    </div>
  );
}

export function WorkoutSession() {
  const navigate = useNavigate();
  const {
    activeWorkout,
    activeWorkoutSets,
    resumeWorkout,
    endWorkout,
    cancelWorkout,
    addSet,
    deleteSet,
  } = useWorkoutLogs();
  const { activeProgram, fetchActiveProgram } = useWorkoutPrograms();
  const { exercises: allExercises, fetchExercises } = useExercises();
  const { getLastPerformance } = useWorkoutLogs();

  const [exercisesWithSets, setExercisesWithSets] = useState<
    ExerciseWithSets[]
  >([]);
  const [showTimer, setShowTimer] = useState(false);
  const [timerMinimized, setTimerMinimized] = useState(false);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [showEndWorkout, setShowEndWorkout] = useState(false);
  const [showCancelWorkout, setShowCancelWorkout] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [durationTimerData, setDurationTimerData] = useState<{
    exerciseIndex: number;
    setIndex: number;
    targetSeconds: number;
  } | null>(null);

  // Form for workout notes
  const {
    register,
    handleSubmit,
    reset: resetNotesForm,
  } = useForm<WorkoutNotesFormData>({
    resolver: zodResolver(workoutNotesSchema),
    defaultValues: {
      notes: '',
    },
  });

  // Resume workout on mount
  useEffect(() => {
    const init = async () => {
      await resumeWorkout();
      await fetchActiveProgram();
      await fetchExercises();
    };
    init();
  }, [resumeWorkout, fetchActiveProgram, fetchExercises]);

  // Initialize exercises from program session
  useEffect(() => {
    const initExercises = async () => {
      if (!activeWorkout) return;

      // If workout has a session, load those exercises
      if (activeWorkout.session_id && activeProgram) {
        const session = activeProgram.sessions.find(
          (s) => s.id === activeWorkout.session_id,
        );
        if (session) {
          const exercisesData: ExerciseWithSets[] = await Promise.all(
            session.exercises.map(async (ex) => {
              const lastPerf = await getLastPerformance(ex.exercise_id);
              const exerciseType = ex.exercise_type || 'reps_weight';
              const isDuration =
                exerciseType === 'duration' ||
                exerciseType === 'duration_weight';

              // Create empty sets based on target
              const sets = Array.from({ length: ex.target_sets }, (_, i) => {
                const lastSet = lastPerf?.[i];
                return {
                  tempId: `${ex.id}-${i}-${Date.now()}`,
                  reps: isDuration
                    ? ''
                    : lastSet?.reps?.toString() ||
                      (ex.target_rep_min?.toString() ?? '8'),
                  weight: lastSet?.weight_kg?.toString() || '0',
                  durationSeconds: isDuration
                    ? ex.target_duration_seconds?.toString() || '30'
                    : '',
                  completed: false,
                };
              });
              return {
                exercise: ex,
                exerciseType,
                sets,
                lastPerformance: lastPerf,
                isExpanded: true,
                supersetGroupId: ex.superset_group_id,
              };
            }),
          );
          setExercisesWithSets(exercisesData);
        }
      }

      // Load any already logged sets
      if (activeWorkoutSets.length > 0) {
        // Group sets by exercise
        const setsByExercise = activeWorkoutSets.reduce(
          (acc, set) => {
            if (!acc[set.exercise_id]) {
              acc[set.exercise_id] = [];
            }
            acc[set.exercise_id].push(set);
            return acc;
          },
          {} as Record<number, typeof activeWorkoutSets>,
        );

        setExercisesWithSets((prev) => {
          return prev.map((ex) => {
            const exerciseId =
              'exercise_id' in ex.exercise
                ? ex.exercise.exercise_id
                : ex.exercise.id;
            const loggedSets = setsByExercise[exerciseId];
            if (loggedSets) {
              return {
                ...ex,
                sets: loggedSets.map((s, i) => ({
                  id: s.id,
                  tempId: `logged-${s.id}-${i}`,
                  reps: s.reps?.toString() || '',
                  weight: s.weight_kg?.toString() || '',
                  durationSeconds: s.duration_seconds?.toString() || '',
                  completed: true,
                })),
              };
            }
            return ex;
          });
        });
      }
    };

    initExercises();
  }, [activeWorkout, activeProgram, activeWorkoutSets, getLastPerformance]);

  // Elapsed time timer
  useEffect(() => {
    if (!activeWorkout) return;

    const startTime = new Date(activeWorkout.started_at).getTime();

    const interval = setInterval(() => {
      const now = Date.now();
      setElapsedTime(Math.floor((now - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [activeWorkout]);

  const formatElapsedTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSetChange = (
    exerciseIndex: number,
    setIndex: number,
    field: 'reps' | 'weight' | 'durationSeconds',
    value: string,
  ) => {
    setExercisesWithSets((prev) => {
      const updated = [...prev];
      updated[exerciseIndex] = {
        ...updated[exerciseIndex],
        sets: updated[exerciseIndex].sets.map((set, i) =>
          i === setIndex ? { ...set, [field]: value } : set,
        ),
      };
      return updated;
    });
  };

  const handleStartDurationTimer = (
    exerciseIndex: number,
    setIndex: number,
  ) => {
    const exerciseData = exercisesWithSets[exerciseIndex];
    const targetSeconds =
      parseInt(exerciseData.sets[setIndex].durationSeconds) || 30;
    setDurationTimerData({ exerciseIndex, setIndex, targetSeconds });
  };

  const handleDurationComplete = async (actualSeconds: number) => {
    if (!activeWorkout || !durationTimerData) return;

    const { exerciseIndex, setIndex } = durationTimerData;
    const exerciseData = exercisesWithSets[exerciseIndex];
    const setData = exerciseData.sets[setIndex];
    const exerciseId =
      'exercise_id' in exerciseData.exercise
        ? exerciseData.exercise.exercise_id
        : exerciseData.exercise.id;

    const weight = parseFloat(setData.weight) || null;
    const hasWeight = exerciseData.exerciseType === 'duration_weight';

    try {
      const newSet = await addSet(
        activeWorkout.id,
        exerciseId,
        null,
        hasWeight ? weight : null,
        actualSeconds,
      );

      setExercisesWithSets((prev) => {
        const updated = [...prev];
        updated[exerciseIndex] = {
          ...updated[exerciseIndex],
          sets: updated[exerciseIndex].sets.map((set, i) =>
            i === setIndex
              ? {
                  ...set,
                  id: newSet.id,
                  durationSeconds: actualSeconds.toString(),
                  completed: true,
                }
              : set,
          ),
        };
        return updated;
      });

      setDurationTimerData(null);
      setShowTimer(true);
    } catch (err) {
      console.error('Failed to log set:', err);
      setDurationTimerData(null);
    }
  };

  const handleCompleteSet = async (exerciseIndex: number, setIndex: number) => {
    if (!activeWorkout) return;

    const exerciseData = exercisesWithSets[exerciseIndex];
    const setData = exerciseData.sets[setIndex];
    const exerciseId =
      'exercise_id' in exerciseData.exercise
        ? exerciseData.exercise.exercise_id
        : exerciseData.exercise.id;

    const isDuration =
      exerciseData.exerciseType === 'duration' ||
      exerciseData.exerciseType === 'duration_weight';

    if (isDuration) {
      handleStartDurationTimer(exerciseIndex, setIndex);
      return;
    }

    const reps = parseInt(setData.reps) || 0;
    const weight = parseFloat(setData.weight) || 0;
    const hasWeight = exerciseData.exerciseType === 'reps_weight';

    if (reps === 0) return;

    try {
      const newSet = await addSet(
        activeWorkout.id,
        exerciseId,
        reps,
        hasWeight ? weight : null,
        null,
      );

      setExercisesWithSets((prev) => {
        const updated = [...prev];
        updated[exerciseIndex] = {
          ...updated[exerciseIndex],
          sets: updated[exerciseIndex].sets.map((set, i) =>
            i === setIndex ? { ...set, id: newSet.id, completed: true } : set,
          ),
        };
        return updated;
      });

      // Auto-start rest timer
      setShowTimer(true);
    } catch (err) {
      console.error('Failed to log set:', err);
    }
  };

  const handleDeleteSet = async (exerciseIndex: number, setIndex: number) => {
    const setData = exercisesWithSets[exerciseIndex].sets[setIndex];

    if (setData.id) {
      await deleteSet(setData.id);
    }

    setExercisesWithSets((prev) => {
      const updated = [...prev];
      updated[exerciseIndex] = {
        ...updated[exerciseIndex],
        sets: updated[exerciseIndex].sets.filter((_, i) => i !== setIndex),
      };
      return updated;
    });
  };

  const handleAddSet = (exerciseIndex: number) => {
    setExercisesWithSets((prev) => {
      const updated = [...prev];
      const exerciseData = updated[exerciseIndex];
      const lastSet = exerciseData.sets[exerciseData.sets.length - 1];
      const isDuration =
        exerciseData.exerciseType === 'duration' ||
        exerciseData.exerciseType === 'duration_weight';

      updated[exerciseIndex] = {
        ...exerciseData,
        sets: [
          ...exerciseData.sets,
          {
            tempId: `new-${exerciseData.exercise.id}-${exerciseData.sets.length}-${Date.now()}`,
            reps: isDuration ? '' : lastSet?.reps || '0',
            weight: lastSet?.weight || '0',
            durationSeconds: isDuration ? lastSet?.durationSeconds || '30' : '',
            completed: false,
          },
        ],
      };
      return updated;
    });
  };

  const handleAddExercise = useCallback(
    async (exercise: Exercise) => {
      const lastPerf = await getLastPerformance(exercise.id);
      const exerciseType = exercise.exercise_type || 'reps_weight';
      const isDuration =
        exerciseType === 'duration' || exerciseType === 'duration_weight';

      setExercisesWithSets((prev) => [
        ...prev,
        {
          exercise,
          exerciseType,
          sets: [
            {
              tempId: `new-${exercise.id}-0-${Date.now()}`,
              reps: isDuration ? '' : lastPerf?.[0]?.reps?.toString() || '10',
              weight: lastPerf?.[0]?.weight_kg?.toString() || '0',
              durationSeconds: isDuration ? '30' : '',
              completed: false,
            },
          ],
          lastPerformance: lastPerf,
          isExpanded: true,
        },
      ]);
      setShowAddExercise(false);
      setSearchQuery('');
    },
    [getLastPerformance],
  );

  const handleRemoveExercise = (exerciseIndex: number) => {
    // Delete all logged sets for this exercise
    const exercise = exercisesWithSets[exerciseIndex];
    exercise.sets.forEach(async (set) => {
      if (set.id) {
        await deleteSet(set.id);
      }
    });

    setExercisesWithSets((prev) => prev.filter((_, i) => i !== exerciseIndex));
  };

  const toggleExerciseExpand = (index: number) => {
    setExercisesWithSets((prev) =>
      prev.map((ex, i) =>
        i === index ? { ...ex, isExpanded: !ex.isExpanded } : ex,
      ),
    );
  };

  const handleEndWorkout = async (data: WorkoutNotesFormData) => {
    if (!activeWorkout) return;
    await endWorkout(activeWorkout.id, data.notes || undefined);
    resetNotesForm();
    navigate('/workout');
  };

  const handleCancelWorkout = async () => {
    if (!activeWorkout) return;
    await cancelWorkout(activeWorkout.id);
    navigate('/workout');
  };

  const filteredExercises = allExercises.filter(
    (ex) =>
      ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ex.muscle_groups?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const totalSets = exercisesWithSets.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => s.completed).length,
    0,
  );

  // Get exercise type icon
  const getExerciseTypeIcon = (type: ExerciseType) => {
    if (type === 'duration' || type === 'duration_weight') {
      return <Clock size={14} className="text-slate-400" />;
    }
    return <Dumbbell size={14} className="text-slate-400" />;
  };

  if (!activeWorkout) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-slate-400 mb-4">No active workout</p>
          <Button onClick={() => navigate('/workout')}>Go to Workouts</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-32">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setShowCancelWorkout(true)}
          className="p-2 text-slate-400 hover:text-white"
        >
          <ArrowLeft size={24} />
        </button>

        <div className="text-center">
          <p className="text-slate-400 text-sm">Workout Time</p>
          <p className="text-white font-mono text-xl">
            {formatElapsedTime(elapsedTime)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowTimer(true)}
          className="p-2 text-slate-400 hover:text-white"
        >
          <Timer size={24} />
        </button>
      </div>

      {/* Stats Bar */}
      <div className="flex justify-around mb-6 p-3 bg-slate-800 rounded-lg">
        <div className="text-center">
          <p className="text-2xl font-bold text-white">
            {exercisesWithSets.length}
          </p>
          <p className="text-xs text-slate-400">Exercises</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-white">{totalSets}</p>
          <p className="text-xs text-slate-400">Sets Done</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-white">
            {exercisesWithSets
              .reduce(
                (sum, ex) =>
                  sum +
                  ex.sets
                    .filter((s) => s.completed)
                    .reduce(
                      (setSum, s) =>
                        setSum +
                        (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 1),
                      0,
                    ),
                0,
              )
              .toFixed(0)}
          </p>
          <p className="text-xs text-slate-400">Volume (kg)</p>
        </div>
      </div>

      {/* Exercises */}
      {exercisesWithSets.length === 0 ? (
        <Card className="mb-4">
          <CardContent className="p-6 text-center">
            <p className="text-slate-400 mb-4">No exercises added yet</p>
            <Button onClick={() => setShowAddExercise(true)}>
              <Plus size={18} className="mr-2" />
              Add Exercise
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {exercisesWithSets.map((exerciseData, exerciseIndex) => {
            const exerciseName =
              'exercise_name' in exerciseData.exercise
                ? exerciseData.exercise.exercise_name
                : exerciseData.exercise.name;
            const isDuration =
              exerciseData.exerciseType === 'duration' ||
              exerciseData.exerciseType === 'duration_weight';
            const hasWeight =
              exerciseData.exerciseType === 'reps_weight' ||
              exerciseData.exerciseType === 'duration_weight';
            const targetInfo =
              'target_rep_min' in exerciseData.exercise
                ? isDuration
                  ? `${exerciseData.exercise.target_duration_seconds || 30}s`
                  : `${exerciseData.exercise.target_rep_min}-${exerciseData.exercise.target_rep_max} reps`
                : null;

            return (
              <Card key={`exercise-${exerciseData.exercise.id}`}>
                <CardContent className="p-4">
                  {/* Exercise Header */}
                  <button
                    type="button"
                    className="flex items-center justify-between w-full text-left"
                    onClick={() => toggleExerciseExpand(exerciseIndex)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleExerciseExpand(exerciseIndex);
                      }
                    }}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white">
                          {exerciseName}
                        </h3>
                        {getExerciseTypeIcon(exerciseData.exerciseType)}
                      </div>
                      {targetInfo && (
                        <p className="text-slate-400 text-sm">
                          Target: {targetInfo}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-sm">
                        {exerciseData.sets.filter((s) => s.completed).length}/
                        {exerciseData.sets.length}
                      </span>
                      {exerciseData.isExpanded ? (
                        <ChevronUp size={20} className="text-slate-400" />
                      ) : (
                        <ChevronDown size={20} className="text-slate-400" />
                      )}
                    </div>
                  </button>

                  {/* Sets */}
                  {exerciseData.isExpanded && (
                    <div className="mt-4">
                      {/* Last Performance */}
                      {exerciseData.lastPerformance &&
                        exerciseData.lastPerformance.length > 0 && (
                          <div className="mb-3 p-2 bg-slate-700/50 rounded text-xs text-slate-400">
                            Last:{' '}
                            {exerciseData.lastPerformance
                              .map((s) =>
                                s.duration_seconds
                                  ? `${s.duration_seconds}s${s.weight_kg ? ` @ ${s.weight_kg}kg` : ''}`
                                  : `${s.weight_kg || 0}kg × ${s.reps || 0}`,
                              )
                              .join(' | ')}
                          </div>
                        )}

                      {/* Set Headers */}
                      <div
                        className={`grid gap-2 mb-2 text-xs text-slate-400 ${
                          isDuration
                            ? hasWeight
                              ? 'grid-cols-10'
                              : 'grid-cols-8'
                            : hasWeight
                              ? 'grid-cols-12'
                              : 'grid-cols-10'
                        }`}
                      >
                        <div className="col-span-2 text-center">SET</div>
                        <div className="col-span-2 text-center">PREV</div>
                        {hasWeight && (
                          <div className="col-span-2 text-center">KG</div>
                        )}
                        {isDuration ? (
                          <div className="col-span-2 text-center">SEC</div>
                        ) : (
                          <div className="col-span-2 text-center">REPS</div>
                        )}
                        <div
                          className={
                            isDuration && !hasWeight
                              ? 'col-span-2'
                              : 'col-span-2'
                          }
                        ></div>
                      </div>

                      {/* Sets List */}
                      {exerciseData.sets.map((set, setIndex) => {
                        const prevSet =
                          exerciseData.lastPerformance?.[setIndex];

                        return (
                          <div
                            key={set.tempId}
                            className={`grid gap-2 items-center py-2 ${
                              isDuration
                                ? hasWeight
                                  ? 'grid-cols-10'
                                  : 'grid-cols-8'
                                : hasWeight
                                  ? 'grid-cols-12'
                                  : 'grid-cols-10'
                            } ${set.completed ? 'bg-green-900/20 rounded' : ''}`}
                          >
                            <div className="col-span-2 text-center text-slate-300">
                              {setIndex + 1}
                            </div>
                            <div className="col-span-2 text-center text-slate-500 text-sm">
                              {prevSet
                                ? prevSet.duration_seconds
                                  ? `${prevSet.duration_seconds}s`
                                  : `${prevSet.weight_kg || 0}×${prevSet.reps || 0}`
                                : '-'}
                            </div>
                            {hasWeight && (
                              <div className="col-span-2">
                                <Input
                                  type="number"
                                  value={set.weight}
                                  onChange={(e) =>
                                    handleSetChange(
                                      exerciseIndex,
                                      setIndex,
                                      'weight',
                                      e.target.value,
                                    )
                                  }
                                  className="text-center p-1 h-8"
                                  disabled={set.completed}
                                />
                              </div>
                            )}
                            {isDuration ? (
                              <div className="col-span-2">
                                <Input
                                  type="number"
                                  value={set.durationSeconds}
                                  onChange={(e) =>
                                    handleSetChange(
                                      exerciseIndex,
                                      setIndex,
                                      'durationSeconds',
                                      e.target.value,
                                    )
                                  }
                                  className="text-center p-1 h-8"
                                  disabled={set.completed}
                                  placeholder="sec"
                                />
                              </div>
                            ) : (
                              <div className="col-span-2">
                                <Input
                                  type="number"
                                  value={set.reps}
                                  onChange={(e) =>
                                    handleSetChange(
                                      exerciseIndex,
                                      setIndex,
                                      'reps',
                                      e.target.value,
                                    )
                                  }
                                  className="text-center p-1 h-8"
                                  disabled={set.completed}
                                />
                              </div>
                            )}
                            <div
                              className={`${isDuration && !hasWeight ? 'col-span-2' : 'col-span-2'} flex justify-end gap-1`}
                            >
                              {set.completed ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteSet(exerciseIndex, setIndex)
                                  }
                                  className="p-1 text-red-400 hover:text-red-300"
                                >
                                  <Trash2 size={16} />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCompleteSet(exerciseIndex, setIndex)
                                  }
                                  className={`p-1 rounded text-white hover:opacity-80 ${
                                    isDuration ? 'bg-purple-600' : 'bg-blue-600'
                                  }`}
                                >
                                  {isDuration ? (
                                    <Play size={16} />
                                  ) : (
                                    <Check size={16} />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Add Set / Remove Exercise */}
                      <div className="flex justify-between mt-3 pt-3 border-t border-slate-700">
                        <button
                          type="button"
                          onClick={() => handleAddSet(exerciseIndex)}
                          className="text-blue-400 text-sm flex items-center gap-1"
                        >
                          <Plus size={16} />
                          Add Set
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveExercise(exerciseIndex)}
                          className="text-red-400 text-sm flex items-center gap-1"
                        >
                          <Trash2 size={16} />
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Exercise Button */}
      <Button
        variant="secondary"
        className="w-full mt-4"
        onClick={() => setShowAddExercise(true)}
      >
        <Plus size={18} className="mr-2" />
        Add Exercise
      </Button>

      {/* Finish Workout Button */}
      <div className="fixed bottom-20 left-0 right-0 p-4 bg-gradient-to-t from-slate-900 to-transparent">
        <Button
          className="w-full max-w-lg mx-auto block"
          onClick={() => setShowEndWorkout(true)}
          disabled={totalSets === 0}
        >
          <Save size={18} className="mr-2" />
          Finish Workout
        </Button>
      </div>

      {/* Duration Timer */}
      {durationTimerData && (
        <DurationTimer
          targetSeconds={durationTimerData.targetSeconds}
          onComplete={handleDurationComplete}
          onCancel={() => setDurationTimerData(null)}
        />
      )}

      {/* Rest Timer */}
      {showTimer && !timerMinimized && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm">
            <RestTimer
              defaultSeconds={90}
              onClose={() => setShowTimer(false)}
              onToggleMinimize={() => setTimerMinimized(true)}
            />
          </div>
        </div>
      )}

      {timerMinimized && (
        <RestTimer
          defaultSeconds={90}
          isMinimized={true}
          onToggleMinimize={() => setTimerMinimized(false)}
        />
      )}

      {/* Add Exercise Modal */}
      <Modal
        isOpen={showAddExercise}
        onClose={() => {
          setShowAddExercise(false);
          setSearchQuery('');
        }}
        title="Add Exercise"
      >
        <Input
          placeholder="Search exercises..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="mb-4"
        />

        <div className="max-h-[50vh] overflow-y-auto space-y-2">
          {filteredExercises.length === 0 ? (
            <p className="text-slate-400 text-center py-4">
              No exercises found. Add some in the Exercise Library.
            </p>
          ) : (
            filteredExercises.map((exercise) => (
              <button
                type="button"
                key={exercise.id}
                onClick={() => handleAddExercise(exercise)}
                className="w-full p-3 bg-slate-700 rounded-lg text-left hover:bg-slate-600 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <p className="text-white font-medium flex-1">
                    {exercise.name}
                  </p>
                  {exercise.exercise_type === 'duration' ||
                  exercise.exercise_type === 'duration_weight' ? (
                    <Clock size={16} className="text-purple-400" />
                  ) : (
                    <Dumbbell size={16} className="text-blue-400" />
                  )}
                </div>
                {exercise.muscle_groups && (
                  <p className="text-slate-400 text-sm">
                    {exercise.muscle_groups}
                  </p>
                )}
              </button>
            ))
          )}
        </div>

        <Button
          variant="secondary"
          className="w-full mt-4"
          onClick={() => navigate('/exercises')}
        >
          Manage Exercise Library
        </Button>
      </Modal>

      {/* End Workout Modal */}
      <Modal
        isOpen={showEndWorkout}
        onClose={() => setShowEndWorkout(false)}
        title="Finish Workout"
      >
        <form onSubmit={handleSubmit(handleEndWorkout)}>
          <div className="mb-4">
            <p className="text-slate-300 mb-2">Workout Summary</p>
            <div className="grid grid-cols-3 gap-4 p-4 bg-slate-700 rounded-lg">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">
                  {formatElapsedTime(elapsedTime)}
                </p>
                <p className="text-xs text-slate-400">Duration</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white">
                  {exercisesWithSets.length}
                </p>
                <p className="text-xs text-slate-400">Exercises</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{totalSets}</p>
                <p className="text-xs text-slate-400">Sets</p>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <label
              htmlFor="workoutNotes"
              className="block text-slate-400 text-sm mb-2"
            >
              Notes (optional)
            </label>
            <TextArea
              id="workoutNotes"
              {...register('notes')}
              placeholder="How did the workout go?"
              rows={3}
            />
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setShowEndWorkout(false)}
            >
              Continue
            </Button>
            <Button type="submit" className="flex-1">
              Save Workout
            </Button>
          </div>
        </form>
      </Modal>

      {/* Cancel Workout Modal */}
      <Modal
        isOpen={showCancelWorkout}
        onClose={() => setShowCancelWorkout(false)}
        title="Cancel Workout?"
      >
        <p className="text-slate-300 mb-6">
          Are you sure you want to cancel this workout? All logged sets will be
          deleted.
        </p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setShowCancelWorkout(false)}
          >
            Keep Going
          </Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700"
            onClick={handleCancelWorkout}
          >
            <X size={18} className="mr-2" />
            Cancel Workout
          </Button>
        </div>
      </Modal>
    </div>
  );
}
