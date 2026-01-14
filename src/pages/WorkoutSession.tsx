import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  Check,
  Clock,
  Dumbbell,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button,
  Card,
  CardContent,
  Input,
  Modal,
  TextArea,
} from '../components/ui';
import {
  DurationTimer,
  ExerciseCard,
  RestTimer,
  SupersetCard,
} from '../components/workout';
import { useWorkoutLogs } from '../hooks/useWorkoutLogs';
import { useWorkoutSession } from '../hooks/useWorkoutSession';
import {
  type WorkoutNotesFormData,
  workoutNotesSchema,
} from '../schemas/forms';
import { getExerciseCoaching, isGeminiInitialized } from '../services/gemini';
import type { AIExerciseCoachingResponse } from '../types';
import { parseLocalTimestamp } from '../utils/date';

export function WorkoutSession() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Get optional date override from query params (e.g., ?date=2025-01-10)
  const dateOverride = searchParams.get('date') || undefined;

  // Main workout session hook
  const {
    activeWorkout,
    exercisesWithSets,
    groupedExercises,
    allExercises,
    totalCompletedSets,
    isInitialized,
    handleSetChange,
    handleCompleteSet,
    handleCompleteRound,
    handleAddSet,
    handleAddSetToSuperset,
    handleDeleteSet,
    handleDeleteRound,
    handleRemoveExercise,
    handleAddExercise,
    toggleExerciseExpand,
    saveDurationSet,
    handleEndWorkout,
    handleCancelWorkout,
    getExerciseId,
  } = useWorkoutSession(dateOverride);

  // Exercise notes from useWorkoutLogs
  const {
    addExerciseNote,
    getExerciseNotes,
    deleteExerciseNote,
    getRecentExerciseHistoryBySession,
  } = useWorkoutLogs();

  // Timer state
  const [showTimer, setShowTimer] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(90);
  const [timerInitialSeconds, setTimerInitialSeconds] = useState(90);
  const [timerRunning, setTimerRunning] = useState(false);

  // Modal state
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [showEndWorkout, setShowEndWorkout] = useState(false);
  const [showCancelWorkout, setShowCancelWorkout] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Duration timer state
  const [durationTimerData, setDurationTimerData] = useState<{
    exerciseIndex: number;
    setIndex: number;
    targetSeconds: number;
  } | null>(null);

  // Elapsed time
  const [elapsedTime, setElapsedTime] = useState(0);

  // AI coaching state
  const [exerciseCoaching, setExerciseCoaching] = useState<
    Map<number, AIExerciseCoachingResponse>
  >(new Map());
  const [coachingLoading, setCoachingLoading] = useState<Set<number>>(
    new Set(),
  );

  // Exercise notes modal state
  const [exerciseNotesModal, setExerciseNotesModal] = useState<{
    exerciseId: number;
    exerciseName: string;
    notes: Array<{ id: number; content: string; created_at: string }>;
    currentWeight: string;
  } | null>(null);
  const [newExerciseNoteContent, setNewExerciseNoteContent] = useState('');

  // Wake lock ref
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const notesListRef = useRef<HTMLDivElement>(null);

  // Form for workout notes
  const {
    register,
    handleSubmit,
    reset: resetNotesForm,
  } = useForm<WorkoutNotesFormData>({
    resolver: zodResolver(workoutNotesSchema),
    defaultValues: { notes: '' },
  });

  // Wake lock management
  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && activeWorkout) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        } catch (err) {
          console.log('Wake lock request failed:', err);
        }
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && activeWorkout) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };
  }, [activeWorkout]);

  // Elapsed time timer
  useEffect(() => {
    if (!activeWorkout) return;

    const startTime = parseLocalTimestamp(activeWorkout.started_at).getTime();
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [activeWorkout]);

  // Auto-scroll notes when modal opens
  useEffect(() => {
    if (exerciseNotesModal && notesListRef.current) {
      notesListRef.current.scrollTop = notesListRef.current.scrollHeight;
    }
  }, [exerciseNotesModal]);

  // Fetch AI coaching for exercises
  const fetchExerciseCoaching = useCallback(
    async (
      exerciseId: number,
      exerciseName: string,
      targetRepMin: number,
      targetRepMax: number,
      targetSets: number,
    ) => {
      if (!isGeminiInitialized()) return;
      if (coachingLoading.has(exerciseId)) return;
      if (exerciseCoaching.has(exerciseId)) return;

      setCoachingLoading((prev) => new Set(prev).add(exerciseId));

      try {
        const history = await getRecentExerciseHistoryBySession(exerciseId, 5);

        if (history.length === 0) {
          setCoachingLoading((prev) => {
            const next = new Set(prev);
            next.delete(exerciseId);
            return next;
          });
          return;
        }

        const coaching = await getExerciseCoaching(
          exerciseName,
          history,
          targetRepMin,
          targetRepMax,
          targetSets,
        );
        coaching.exerciseId = exerciseId;
        setExerciseCoaching((prev) => new Map(prev).set(exerciseId, coaching));
      } catch (err) {
        console.error('Failed to fetch exercise coaching:', err);
      } finally {
        setCoachingLoading((prev) => {
          const next = new Set(prev);
          next.delete(exerciseId);
          return next;
        });
      }
    },
    [coachingLoading, exerciseCoaching, getRecentExerciseHistoryBySession],
  );

  // Fetch coaching when exercises load
  useEffect(() => {
    if (!isGeminiInitialized() || exercisesWithSets.length === 0) return;

    exercisesWithSets.forEach((ex) => {
      const exerciseId = getExerciseId(ex);
      const exerciseName = ex.exercise.name;

      if (
        ex.exerciseType === 'duration' ||
        ex.exerciseType === 'duration_weight'
      )
        return;

      const targetRepMin = ex.workoutLogExercise.target_rep_min ?? 8;
      const targetRepMax = ex.workoutLogExercise.target_rep_max ?? 12;
      const targetSets = ex.workoutLogExercise.target_sets ?? 3;

      fetchExerciseCoaching(
        exerciseId,
        exerciseName,
        targetRepMin,
        targetRepMax,
        targetSets,
      );
    });
  }, [exercisesWithSets, fetchExerciseCoaching, getExerciseId]);

  // Exercise notes handlers
  const handleOpenExerciseNotes = useCallback(
    async (exerciseId: number, exerciseName: string, currentWeight: string) => {
      const notes = await getExerciseNotes(exerciseId);
      setExerciseNotesModal({
        exerciseId,
        exerciseName,
        notes: notes.map((n) => ({
          id: n.id,
          content: n.content,
          created_at: n.created_at,
        })),
        currentWeight,
      });
    },
    [getExerciseNotes],
  );

  const handleAddNote = async () => {
    if (!exerciseNotesModal || !newExerciseNoteContent.trim()) return;

    let noteContent = newExerciseNoteContent.trim();
    if (
      exerciseNotesModal.currentWeight &&
      parseFloat(exerciseNotesModal.currentWeight) > 0
    ) {
      noteContent += ` @ ${exerciseNotesModal.currentWeight} lbs`;
    }

    const note = await addExerciseNote(
      exerciseNotesModal.exerciseId,
      noteContent,
    );
    setExerciseNotesModal((prev) =>
      prev
        ? {
            ...prev,
            notes: [
              ...prev.notes,
              {
                id: note.id,
                content: note.content,
                created_at: note.created_at,
              },
            ],
          }
        : null,
    );
    setNewExerciseNoteContent('');
  };

  const handleDeleteNote = async (noteId: number) => {
    await deleteExerciseNote(noteId);
    setExerciseNotesModal((prev) =>
      prev
        ? { ...prev, notes: prev.notes.filter((n) => n.id !== noteId) }
        : null,
    );
  };

  // Duration timer handlers
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
    if (!durationTimerData) return;
    const { exerciseIndex, setIndex } = durationTimerData;

    await saveDurationSet(exerciseIndex, setIndex, actualSeconds);
    setDurationTimerData(null);

    // Start rest timer
    startRestTimer();
  };

  // Helper to start rest timer after completing a set
  const startRestTimer = () => {
    setTimerSeconds(timerInitialSeconds);
    setTimerRunning(true);
    setShowTimer(true);
  };

  // Wrapper for completing a single set (starts rest timer)
  const onCompleteSet = async (exerciseIndex: number, setIndex: number) => {
    const success = await handleCompleteSet(exerciseIndex, setIndex);
    if (success) {
      startRestTimer();
    }
  };

  // Wrapper for completing a superset round (starts rest timer)
  const onCompleteRound = async (
    exerciseIndices: number[],
    roundNumber: number,
  ) => {
    const success = await handleCompleteRound(exerciseIndices, roundNumber);
    if (success) {
      startRestTimer();
    }
  };

  // End/Cancel workout handlers
  const onEndWorkout = async (data: WorkoutNotesFormData) => {
    await handleEndWorkout(data.notes || undefined);
    resetNotesForm();
    navigate('/workout');
  };

  const onCancelWorkout = async () => {
    await handleCancelWorkout();
    navigate('/workout');
  };

  // Helper functions
  const formatElapsedTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const filteredExercises = allExercises.filter(
    (ex) =>
      ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ex.muscle_groups?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Redirect if no active workout
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-pulse text-slate-400">Loading workout...</div>
      </div>
    );
  }

  if (!activeWorkout) {
    return (
      <div className="p-4 text-center">
        <p className="text-slate-400 mb-4">No active workout found</p>
        <Button onClick={() => navigate('/workout')}>Go to Workout</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowCancelWorkout(true)}
          className="p-2 hover:bg-slate-800 rounded-lg"
        >
          <ArrowLeft size={24} className="text-slate-400" />
        </button>
        <div className="text-center">
          <h1 className="text-lg font-semibold text-white">Workout</h1>
          <p className="text-sm text-slate-400">
            {formatElapsedTime(elapsedTime)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowEndWorkout(true)}
          className="p-2 hover:bg-slate-800 rounded-lg"
        >
          <Check size={24} className="text-green-400" />
        </button>
      </div>

      {/* Stats Bar */}
      <div className="flex justify-around bg-slate-800/50 rounded-lg p-3">
        <div className="text-center">
          <p className="text-2xl font-bold text-white">{totalCompletedSets}</p>
          <p className="text-xs text-slate-400">Sets</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-white">
            {exercisesWithSets.length}
          </p>
          <p className="text-xs text-slate-400">Exercises</p>
        </div>
        <button
          type="button"
          onClick={() => setShowTimer(true)}
          className="text-center hover:bg-slate-700/50 rounded-lg px-3 py-1 transition-colors"
        >
          <p className="text-2xl font-bold text-blue-400">
            <Clock size={24} />
          </p>
          <p className="text-xs text-slate-400">Timer</p>
        </button>
      </div>

      {/* Exercises */}
      <div className="space-y-3">
        {groupedExercises.map((item) => {
          if (Array.isArray(item)) {
            // Superset
            const exerciseIndices = item.map((ex) =>
              exercisesWithSets.indexOf(ex),
            );

            // Generate stable key from superset exercises
            const supersetKey = item.map((ex) => ex.exercise.id).join('-');

            return (
              <Card
                key={`superset-${supersetKey}`}
                className="border-purple-500/30 bg-purple-900/10"
              >
                <CardContent className="p-3">
                  <SupersetCard
                    supersetExercises={item}
                    exerciseIndices={exerciseIndices}
                    coachingMap={exerciseCoaching}
                    onToggleExpand={() => {
                      item.forEach((ex) => {
                        const exIdx = exercisesWithSets.indexOf(ex);
                        toggleExerciseExpand(exIdx);
                      });
                    }}
                    onSetChange={handleSetChange}
                    onCompleteRound={(roundNumber) =>
                      onCompleteRound(exerciseIndices, roundNumber)
                    }
                    onDeleteRound={(roundNumber) =>
                      handleDeleteRound(exerciseIndices, roundNumber)
                    }
                    onAddRound={() => handleAddSetToSuperset(exerciseIndices)}
                    onStartDurationTimer={handleStartDurationTimer}
                    onOpenNotes={(
                      exerciseIndex,
                      exerciseName,
                      currentWeight,
                    ) => {
                      const exerciseId = getExerciseId(
                        exercisesWithSets[exerciseIndex],
                      );
                      handleOpenExerciseNotes(
                        exerciseId,
                        exerciseName,
                        currentWeight,
                      );
                    }}
                    getExerciseId={getExerciseId}
                  />
                </CardContent>
              </Card>
            );
          }

          // Single exercise
          const exerciseIndex = exercisesWithSets.indexOf(item);
          const exerciseId = getExerciseId(item);

          return (
            <Card key={`exercise-${item.exercise.id}`}>
              <CardContent className="p-3">
                <ExerciseCard
                  exerciseData={item}
                  coaching={exerciseCoaching.get(exerciseId)}
                  onToggleExpand={() => toggleExerciseExpand(exerciseIndex)}
                  onSetChange={(setIndex, field, value) =>
                    handleSetChange(exerciseIndex, setIndex, field, value)
                  }
                  onCompleteSet={(setIndex) =>
                    onCompleteSet(exerciseIndex, setIndex)
                  }
                  onDeleteSet={(setIndex) =>
                    handleDeleteSet(exerciseIndex, setIndex)
                  }
                  onAddSet={() => handleAddSet(exerciseIndex)}
                  onStartDurationTimer={(setIndex) =>
                    handleStartDurationTimer(exerciseIndex, setIndex)
                  }
                  onOpenNotes={() => {
                    const name = item.exercise.name;
                    handleOpenExerciseNotes(
                      exerciseId,
                      name,
                      item.sets[0]?.weight || '0',
                    );
                  }}
                  onRemoveExercise={() => handleRemoveExercise(exerciseIndex)}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add Exercise Button */}
      <Button
        className="w-full"
        variant="secondary"
        onClick={() => setShowAddExercise(true)}
      >
        <Plus size={20} className="mr-2" />
        Add Exercise
      </Button>

      {/* Rest Timer */}
      <RestTimer
        isOpen={showTimer}
        onOpenChange={setShowTimer}
        seconds={timerSeconds}
        setSeconds={setTimerSeconds}
        isRunning={timerRunning}
        setIsRunning={setTimerRunning}
        initialSeconds={timerInitialSeconds}
        setInitialSeconds={setTimerInitialSeconds}
      />

      {/* Duration Timer */}
      {durationTimerData && (
        <DurationTimer
          targetSeconds={durationTimerData.targetSeconds}
          onComplete={handleDurationComplete}
          onCancel={() => setDurationTimerData(null)}
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
        <div className="max-h-80 overflow-y-auto space-y-2">
          {filteredExercises.map((exercise) => (
            <button
              key={exercise.id}
              type="button"
              onClick={() => {
                handleAddExercise(exercise);
                setShowAddExercise(false);
                setSearchQuery('');
              }}
              className="w-full text-left p-3 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-2">
                {exercise.exercise_type === 'duration' ||
                exercise.exercise_type === 'duration_weight' ? (
                  <Clock size={16} className="text-slate-400" />
                ) : (
                  <Dumbbell size={16} className="text-slate-400" />
                )}
                <span className="font-medium text-white">{exercise.name}</span>
              </div>
              {exercise.muscle_groups && (
                <p className="text-xs text-slate-400 mt-1">
                  {exercise.muscle_groups}
                </p>
              )}
            </button>
          ))}
          {filteredExercises.length === 0 && (
            <p className="text-center text-slate-400 py-4">
              No exercises found
            </p>
          )}
        </div>
      </Modal>

      {/* End Workout Modal */}
      <Modal
        isOpen={showEndWorkout}
        onClose={() => setShowEndWorkout(false)}
        title="End Workout"
      >
        <form onSubmit={handleSubmit(onEndWorkout)} className="space-y-4">
          <div>
            <p className="text-slate-300 mb-2">
              Great work! You completed {totalCompletedSets} sets in{' '}
              {formatElapsedTime(elapsedTime)}.
            </p>
            <TextArea
              {...register('notes')}
              placeholder="Add any notes about this workout (optional)"
              rows={3}
            />
          </div>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowEndWorkout(false)}
              className="flex-1"
            >
              Cancel
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
        title="Cancel Workout"
      >
        <p className="text-slate-300 mb-4">
          Are you sure you want to cancel this workout? All progress will be
          lost.
        </p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => setShowCancelWorkout(false)}
            className="flex-1"
          >
            Keep Going
          </Button>
          <Button variant="danger" onClick={onCancelWorkout} className="flex-1">
            Cancel Workout
          </Button>
        </div>
      </Modal>

      {/* Exercise Notes Modal */}
      <Modal
        isOpen={!!exerciseNotesModal}
        onClose={() => setExerciseNotesModal(null)}
        title={`Notes: ${exerciseNotesModal?.exerciseName || ''}`}
      >
        {exerciseNotesModal && (
          <div className="space-y-4">
            {/* Notes List */}
            <div
              ref={notesListRef}
              className="max-h-60 overflow-y-auto space-y-2"
            >
              {exerciseNotesModal.notes.length === 0 ? (
                <p className="text-slate-400 text-center py-4">No notes yet</p>
              ) : (
                exerciseNotesModal.notes.map((note) => (
                  <div
                    key={note.id}
                    className="flex items-start gap-2 p-2 bg-slate-800 rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="text-sm text-slate-300">{note.content}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {new Date(note.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteNote(note.id)}
                      className="p-1 text-red-400/70 hover:text-red-400 hover:bg-red-900/30 rounded"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add Note Input */}
            <div className="flex gap-2">
              <Input
                value={newExerciseNoteContent}
                onChange={(e) => setNewExerciseNoteContent(e.target.value)}
                placeholder="Add a note..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddNote();
                  }
                }}
              />
              <Button
                onClick={handleAddNote}
                disabled={!newExerciseNoteContent.trim()}
              >
                <Send size={16} />
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
