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
import { parseLocalTimestamp } from '../utils/date';
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
  notes: string; // Notes for this exercise (e.g., why can't progress, form cues)
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
                notes: '',
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
              // Merge logged sets with existing sets
              const mergedSets = ex.sets.map((existingSet, i) => {
                const loggedSet = loggedSets[i];
                if (loggedSet) {
                  return {
                    id: loggedSet.id,
                    tempId: `logged-${loggedSet.id}-${i}`,
                    reps: loggedSet.reps?.toString() || '',
                    weight: loggedSet.weight_kg?.toString() || '',
                    durationSeconds:
                      loggedSet.duration_seconds?.toString() || '',
                    completed: true,
                  };
                }
                return existingSet;
              });
              return {
                ...ex,
                sets: mergedSets,
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

    const startTime = parseLocalTimestamp(activeWorkout.started_at).getTime();

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
      parseInt(exerciseData.sets[setIndex].durationSeconds, 10) || 30;
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
        exerciseData.notes || undefined,
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

    const reps = parseInt(setData.reps, 10) || 0;
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
        exerciseData.notes || undefined,
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

  // Add set to all exercises in a superset
  const handleAddSetToSuperset = (exerciseIndices: number[]) => {
    setExercisesWithSets((prev) => {
      const updated = [...prev];

      exerciseIndices.forEach((exerciseIndex) => {
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
              durationSeconds: isDuration
                ? lastSet?.durationSeconds || '30'
                : '',
              completed: false,
            },
          ],
        };
      });

      return updated;
    });
  };

  // Delete a round (set at specific index) from ALL exercises in a superset
  const handleDeleteRound = (
    supersetExerciseIndices: number[],
    roundNumber: number,
  ) => {
    setExercisesWithSets((prev) => {
      const updated = [...prev];

      supersetExerciseIndices.forEach((exerciseIndex) => {
        const exerciseData = updated[exerciseIndex];

        // Only delete if this round exists
        if (exerciseData.sets[roundNumber]) {
          const newSets = [
            ...exerciseData.sets.slice(0, roundNumber),
            ...exerciseData.sets.slice(roundNumber + 1),
          ];

          updated[exerciseIndex] = {
            ...exerciseData,
            sets: newSets,
          };
        }
      });

      return updated;
    });
  };

  // Complete ALL exercises in a round at once
  const handleCompleteRound = (
    supersetExerciseIndices: number[],
    roundNumber: number,
  ) => {
    setExercisesWithSets((prev) => {
      const updated = [...prev];

      supersetExerciseIndices.forEach((exerciseIndex) => {
        const exerciseData = updated[exerciseIndex];
        const set = exerciseData.sets[roundNumber];

        if (set && !set.completed) {
          const newSets = [...exerciseData.sets];
          newSets[roundNumber] = {
            ...set,
            completed: true,
          };

          updated[exerciseIndex] = {
            ...exerciseData,
            sets: newSets,
          };
        }
      });

      return updated;
    });
  };

  // Check if ALL exercises in a round are complete
  const isRoundComplete = (
    supersetExercises: ExerciseWithSets[],
    roundNumber: number,
  ): boolean => {
    return supersetExercises.every((ex) => {
      const set = ex.sets[roundNumber];
      return set?.completed;
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
          notes: '',
        },
      ]);
      setShowAddExercise(false);
      setSearchQuery('');
    },
    [getLastPerformance],
  );

  const toggleExerciseExpand = (index: number) => {
    setExercisesWithSets((prev) =>
      prev.map((ex, i) =>
        i === index ? { ...ex, isExpanded: !ex.isExpanded } : ex,
      ),
    );
  };

  const handleUpdateExerciseNotes = (index: number, notes: string) => {
    setExercisesWithSets((prev) =>
      prev.map((ex, i) => (i === index ? { ...ex, notes } : ex)),
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

  // Group exercises by superset
  const groupedExercises: (ExerciseWithSets | ExerciseWithSets[])[] = [];
  const processedIndices = new Set<number>();

  exercisesWithSets.forEach((ex, idx) => {
    if (processedIndices.has(idx)) return;

    if (ex.supersetGroupId) {
      // Find all exercises with the same superset group ID
      const supersetExercises = exercisesWithSets.filter(
        (e) => e.supersetGroupId === ex.supersetGroupId,
      );

      if (supersetExercises.length > 1) {
        // This is a real superset with multiple exercises
        supersetExercises.forEach((e) => {
          const originalIdx = exercisesWithSets.indexOf(e);
          processedIndices.add(originalIdx);
        });
        groupedExercises.push(supersetExercises);
      } else {
        // Only one exercise with this ID, treat as single
        groupedExercises.push(ex);
        processedIndices.add(idx);
      }
    } else {
      // No superset group, treat as single exercise
      groupedExercises.push(ex);
      processedIndices.add(idx);
    }
  });

  // Get exercise type icon
  const getExerciseTypeIcon = (type: ExerciseType) => {
    if (type === 'duration' || type === 'duration_weight') {
      return <Clock size={14} className="text-slate-400" />;
    }
    return <Dumbbell size={14} className="text-slate-400" />;
  };

  // Render exercise content (without Card wrapper)
  const renderExerciseContent = (
    exerciseData: ExerciseWithSets,
    exerciseIndex: number,
  ) => {
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

    // Get target info for displaying recommended reps
    const targetRepMin =
      'target_rep_min' in exerciseData.exercise
        ? exerciseData.exercise.target_rep_min
        : null;
    const targetRepMax =
      'target_rep_max' in exerciseData.exercise
        ? exerciseData.exercise.target_rep_max
        : null;
    const targetDuration =
      'target_duration_seconds' in exerciseData.exercise
        ? exerciseData.exercise.target_duration_seconds
        : null;

    const targetInfo = isDuration
      ? targetDuration
        ? `${targetDuration}s`
        : null
      : targetRepMin && targetRepMax
        ? `${targetRepMin}-${targetRepMax} reps`
        : null;

    return (
      <>
        {/* Exercise Header */}
        <button
          type="button"
          className="flex items-center justify-between w-full text-left"
          onClick={() => toggleExerciseExpand(exerciseIndex)}
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white">{exerciseName}</h3>
              {getExerciseTypeIcon(exerciseData.exerciseType)}
            </div>
            {targetInfo && (
              <p className="text-blue-400 text-sm">Target: {targetInfo}</p>
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
          <div className="mt-3">
            {/* Last Performance */}
            {exerciseData.lastPerformance &&
              exerciseData.lastPerformance.length > 0 && (
                <div className="mb-2 px-2 py-1.5 bg-slate-700/50 rounded text-xs text-slate-400">
                  <span className="text-slate-500">Last: </span>
                  {exerciseData.lastPerformance
                    .map((s) =>
                      s.duration_seconds
                        ? `${s.duration_seconds}s${s.weight_kg ? `@${s.weight_kg}lbs` : ''}`
                        : `${s.weight_kg || 0}×${s.reps || 0}`,
                    )
                    .join(' | ')}
                </div>
              )}

            {/* Exercise Notes - Compact */}
            <div className="mb-2">
              <input
                type="text"
                value={exerciseData.notes}
                onChange={(e) =>
                  handleUpdateExerciseNotes(exerciseIndex, e.target.value)
                }
                placeholder="Add note (form cues, limitations...)"
                className="w-full px-2 py-1 text-xs bg-slate-700/30 border border-slate-700 rounded text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Compact Sets List */}
            <div className="space-y-1.5">
              {exerciseData.sets.map((set, setIndex) => {
                const prevSet = exerciseData.lastPerformance?.[setIndex];

                return (
                  <div
                    key={set.tempId}
                    className={`flex items-center gap-2 py-1.5 px-2 rounded ${
                      set.completed ? 'bg-green-900/30' : 'bg-slate-800/50'
                    }`}
                  >
                    {/* Set Number */}
                    <span className="w-6 text-center text-sm font-medium text-slate-400">
                      {setIndex + 1}
                    </span>

                    {/* Weight Input (if applicable) */}
                    {hasWeight && (
                      <div className="flex items-center gap-1">
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
                          className="w-16 h-8 text-center text-sm p-1"
                          disabled={set.completed}
                          placeholder="lbs"
                        />
                        <span className="text-slate-500 text-xs">lbs</span>
                      </div>
                    )}

                    {/* Separator */}
                    {hasWeight && (
                      <span className="text-slate-600 text-sm">×</span>
                    )}

                    {/* Reps or Duration Input */}
                    {isDuration ? (
                      <div className="flex items-center gap-1">
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
                          className="w-16 h-8 text-center text-sm p-1"
                          disabled={set.completed}
                          placeholder="sec"
                        />
                        <span className="text-slate-500 text-xs">sec</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
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
                          className="w-14 h-8 text-center text-sm p-1"
                          disabled={set.completed}
                          placeholder="reps"
                        />
                      </div>
                    )}

                    {/* Previous indicator */}
                    {prevSet && !set.completed && (
                      <span className="text-slate-500 text-xs ml-auto mr-1">
                        prev:{' '}
                        {prevSet.duration_seconds
                          ? `${prevSet.duration_seconds}s`
                          : `${prevSet.weight_kg || 0}×${prevSet.reps || 0}`}
                      </span>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 ml-auto">
                      <button
                        type="button"
                        onClick={() => handleDeleteSet(exerciseIndex, setIndex)}
                        className="p-1.5 text-red-400/70 hover:text-red-400 hover:bg-red-900/30 rounded transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                      {!set.completed && (
                        <button
                          type="button"
                          onClick={() =>
                            handleCompleteSet(exerciseIndex, setIndex)
                          }
                          className="p-1.5 text-green-400 hover:bg-green-900/30 rounded transition-colors"
                        >
                          {isDuration ? (
                            <Play size={16} />
                          ) : (
                            <Check size={16} />
                          )}
                        </button>
                      )}
                      {set.completed && (
                        <Check size={16} className="text-green-400 mx-1.5" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add Set - Compact */}
            <button
              type="button"
              onClick={() => handleAddSet(exerciseIndex)}
              className="mt-2 text-blue-400 text-sm flex items-center gap-1 hover:text-blue-300"
            >
              <Plus size={14} />
              Add Set
            </button>
          </div>
        )}
      </>
    );
  };

  // Render superset with Option B layout (card-style, spacious)
  const renderSupersetContent = (supersetExercises: ExerciseWithSets[]) => {
    // Find the maximum number of sets across all exercises in the superset
    const maxSets = Math.max(...supersetExercises.map((ex) => ex.sets.length));
    const allExpanded = supersetExercises.every((ex) => ex.isExpanded);
    const exerciseIndices = supersetExercises.map((ex) =>
      exercisesWithSets.indexOf(ex),
    );

    // Toggle all exercises in superset together
    const toggleSuperset = () => {
      supersetExercises.forEach((ex) => {
        const idx = exercisesWithSets.indexOf(ex);
        toggleExerciseExpand(idx);
      });
    };

    // Calculate total completed sets
    const totalCompletedSets = supersetExercises.reduce(
      (sum, ex) => sum + ex.sets.filter((s) => s.completed).length,
      0,
    );
    const totalSetsInSuperset = supersetExercises.reduce(
      (sum, ex) => sum + ex.sets.length,
      0,
    );

    return (
      <>
        {/* Superset Header */}
        <button
          type="button"
          className="flex items-center justify-between w-full text-left mb-4"
          onClick={toggleSuperset}
        >
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {supersetExercises.map((ex, idx) => {
                const exerciseName =
                  'exercise_name' in ex.exercise
                    ? ex.exercise.exercise_name
                    : ex.exercise.name;
                return (
                  <div key={ex.exercise.id} className="flex items-center gap-1">
                    <span className="font-medium text-white">
                      {exerciseName}
                    </span>
                    {getExerciseTypeIcon(ex.exerciseType)}
                    {idx < supersetExercises.length - 1 && (
                      <span className="text-purple-400 font-bold ml-1">+</span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-slate-400 text-sm mt-1">
              {totalCompletedSets} / {totalSetsInSuperset} sets complete
            </p>
          </div>
          <div className="flex items-center">
            {allExpanded ? (
              <ChevronUp size={20} className="text-slate-400" />
            ) : (
              <ChevronDown size={20} className="text-slate-400" />
            )}
          </div>
        </button>

        {/* Exercise Notes for Superset (shown when expanded) */}
        {allExpanded && (
          <div className="mb-4 space-y-2">
            {supersetExercises.map((ex) => {
              const exerciseIndex = exercisesWithSets.indexOf(ex);
              const exerciseName =
                'exercise_name' in ex.exercise
                  ? ex.exercise.exercise_name
                  : ex.exercise.name;
              return (
                <div
                  key={`notes-${ex.exercise.id}`}
                  className="flex items-center gap-2"
                >
                  <span className="text-xs text-slate-500 min-w-[80px] truncate">
                    {exerciseName}:
                  </span>
                  <input
                    type="text"
                    value={ex.notes}
                    onChange={(e) =>
                      handleUpdateExerciseNotes(exerciseIndex, e.target.value)
                    }
                    placeholder="Note..."
                    className="flex-1 px-2 py-1 text-sm bg-slate-700/50 border border-slate-600 rounded text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Rounds */}
        {allExpanded && (
          <div className="space-y-4">
            {Array.from({ length: maxSets }).map((_, roundNumber) => {
              const roundKey = supersetExercises
                .map((ex) => `${ex.exercise.id}-${roundNumber}`)
                .join('-');
              const roundComplete = isRoundComplete(
                supersetExercises,
                roundNumber,
              );

              return (
                <div
                  key={`superset-round-${roundKey}`}
                  className={`border rounded-lg p-3 ${
                    roundComplete
                      ? 'border-green-600/50 bg-green-900/10'
                      : 'border-slate-700 bg-slate-800/30'
                  }`}
                >
                  {/* Round Header - Compact */}
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-700/50">
                    <span
                      className={`text-sm font-medium ${
                        roundComplete ? 'text-green-400' : 'text-purple-400'
                      }`}
                    >
                      Round {roundNumber + 1}
                      {roundComplete && ' ✓'}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleCompleteRound(exerciseIndices, roundNumber)
                        }
                        disabled={roundComplete}
                        className={`px-2 py-1 text-xs rounded font-medium flex items-center gap-1 transition-colors ${
                          roundComplete
                            ? 'bg-green-900/30 text-green-400/50 cursor-not-allowed'
                            : 'bg-green-600 hover:bg-green-700 text-white'
                        }`}
                      >
                        <Check size={12} />
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleDeleteRound(exerciseIndices, roundNumber)
                        }
                        className="p-1 rounded text-red-400/70 hover:text-red-400 hover:bg-red-900/30 transition-colors"
                        title="Delete this round"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Exercises in this round - Compact layout */}
                  <div className="space-y-1.5">
                    {supersetExercises.map((ex) => {
                      const exerciseIndex = exercisesWithSets.indexOf(ex);
                      const set = ex.sets[roundNumber];

                      // Skip if this exercise doesn't have this set
                      if (!set) return null;

                      const exerciseName =
                        'exercise_name' in ex.exercise
                          ? ex.exercise.exercise_name
                          : ex.exercise.name;
                      const isDuration =
                        ex.exerciseType === 'duration' ||
                        ex.exerciseType === 'duration_weight';
                      const hasWeight =
                        ex.exerciseType === 'reps_weight' ||
                        ex.exerciseType === 'duration_weight';
                      const prevSet = ex.lastPerformance?.[roundNumber];

                      // Get target info for duration exercises
                      const targetDuration =
                        'target_duration_seconds' in ex.exercise
                          ? ex.exercise.target_duration_seconds
                          : null;

                      return (
                        <div
                          key={`${ex.exercise.id}-round-${roundNumber}`}
                          className={`flex items-center gap-2 py-1.5 px-2 rounded ${
                            set.completed
                              ? 'bg-green-900/30'
                              : 'bg-slate-800/50'
                          }`}
                        >
                          {/* Exercise name */}
                          <span className="text-sm font-medium text-slate-200 min-w-[80px] truncate">
                            {exerciseName}
                          </span>
                          {getExerciseTypeIcon(ex.exerciseType)}

                          {/* Weight Input (if applicable) */}
                          {hasWeight && (
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                value={set.weight}
                                onChange={(e) =>
                                  handleSetChange(
                                    exerciseIndex,
                                    roundNumber,
                                    'weight',
                                    e.target.value,
                                  )
                                }
                                className="w-16 h-8 text-center text-sm p-1"
                                disabled={set.completed}
                                placeholder="lbs"
                              />
                              <span className="text-slate-500 text-xs">
                                lbs
                              </span>
                            </div>
                          )}

                          {/* Separator */}
                          {hasWeight && (
                            <span className="text-slate-600 text-sm">×</span>
                          )}

                          {/* Reps or Duration Input */}
                          {isDuration ? (
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                value={set.durationSeconds}
                                onChange={(e) =>
                                  handleSetChange(
                                    exerciseIndex,
                                    roundNumber,
                                    'durationSeconds',
                                    e.target.value,
                                  )
                                }
                                className="w-16 h-8 text-center text-sm p-1"
                                disabled={set.completed}
                                placeholder="sec"
                              />
                              <span className="text-slate-500 text-xs">
                                sec
                              </span>
                              {/* Show target duration hint */}
                              {targetDuration && !set.completed && (
                                <span className="text-blue-400/60 text-xs">
                                  ({targetDuration}s)
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                value={set.reps}
                                onChange={(e) =>
                                  handleSetChange(
                                    exerciseIndex,
                                    roundNumber,
                                    'reps',
                                    e.target.value,
                                  )
                                }
                                className="w-14 h-8 text-center text-sm p-1"
                                disabled={set.completed}
                                placeholder="reps"
                              />
                            </div>
                          )}

                          {/* Previous indicator */}
                          {prevSet && !set.completed && (
                            <span className="text-slate-500 text-xs ml-auto mr-1">
                              prev:{' '}
                              {prevSet.duration_seconds
                                ? `${prevSet.duration_seconds}s`
                                : `${prevSet.weight_kg || 0}×${prevSet.reps || 0}`}
                            </span>
                          )}

                          {/* Action buttons */}
                          <div className="flex items-center gap-1 ml-auto">
                            {!set.completed && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleCompleteSet(exerciseIndex, roundNumber)
                                }
                                className="p-1.5 text-green-400 hover:bg-green-900/30 rounded transition-colors"
                                title="Complete this exercise"
                              >
                                {isDuration ? (
                                  <Play size={16} />
                                ) : (
                                  <Check size={16} />
                                )}
                              </button>
                            )}
                            {set.completed && (
                              <Check
                                size={16}
                                className="text-green-400 mx-1.5"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Add Round Button - Compact */}
            <button
              type="button"
              onClick={() => handleAddSetToSuperset(exerciseIndices)}
              className="w-full py-2 rounded-lg border border-dashed border-purple-500/50 text-purple-400 hover:bg-purple-900/20 transition-colors flex items-center justify-center gap-1 text-sm"
            >
              <Plus size={16} />
              Add Round
            </button>
          </div>
        )}
      </>
    );
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
                        (parseFloat(s.weight) || 0) *
                          (parseInt(s.reps, 10) || 1),
                      0,
                    ),
                0,
              )
              .toFixed(0)}
          </p>
          <p className="text-xs text-slate-400">Volume (lbs)</p>
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
          {groupedExercises.map((item) => {
            if (Array.isArray(item)) {
              // SUPERSET GROUP - render with alternating sets
              const supersetKey = item.map((ex) => ex.exercise.id).join('-');
              return (
                <Card
                  key={`superset-${supersetKey}`}
                  className="border-2 border-purple-500/50"
                >
                  <CardContent className="p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <div className="px-2 py-1 bg-purple-600/20 text-purple-400 text-xs rounded font-semibold">
                        SUPERSET
                      </div>
                      <span className="text-slate-400 text-sm">
                        {item.length} exercises
                      </span>
                    </div>
                    {renderSupersetContent(item)}
                  </CardContent>
                </Card>
              );
            } else {
              // SINGLE EXERCISE - normal card
              const exerciseIndex = exercisesWithSets.indexOf(item);
              return (
                <Card key={`exercise-${item.exercise.id}`}>
                  <CardContent className="p-4">
                    {renderExerciseContent(item, exerciseIndex)}
                  </CardContent>
                </Card>
              );
            }
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
      <div className="mt-6 mb-24 max-w-lg mx-auto">
        <Button
          className="w-full"
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
