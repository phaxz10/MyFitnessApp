import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  Check,
  Clock,
  Combine,
  Dumbbell,
  Play,
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
  SessionChangesModal,
  SupersetCard,
} from '../components/workout';
import { useWorkoutLogs } from '../hooks/useWorkoutLogs';
import { useWorkoutPrograms } from '../hooks/useWorkoutPrograms';
import { useWorkoutSession } from '../hooks/useWorkoutSession';
import {
  type WorkoutNotesFormData,
  workoutNotesSchema,
} from '../schemas/forms';
import { getExerciseCoaching, isOpenAIInitialized } from '../services/openai';
import type { AIExerciseCoachingResponse, Exercise } from '../types';
import { parseLocalTimestamp } from '../utils/date';
import { formatElapsedTime } from '../utils/formatters';
import {
  compareSessionToProgram,
  type SessionDiff,
} from '../utils/sessionDiff';

// Generate unique superset ID
function generateSupersetId(): string {
  return `ss-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

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
    isLoading,
    handleSetChange,
    handleCompleteSet,
    handleUncompleteSet,
    handleCompleteRound,
    handleAddSet,
    handleAddSetToSuperset,
    handleDeleteSet,
    handleDeleteRound,
    handleRemoveExercise,
    handleAddExercise,
    handleLinkExercisesAsSuperset,
    handleBreakSuperset,
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
    getWorkoutLogExercises,
  } = useWorkoutLogs();

  // Program management
  const { getSessionExercises, syncSessionToProgram } = useWorkoutPrograms();

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

  // Superset selection state in Add Exercise modal
  const [supersetSelection, setSupersetSelection] = useState<Exercise[]>([]);

  // Link superset selection state (for existing exercises)
  const [linkSupersetSelection, setLinkSupersetSelection] = useState<
    number | null
  >(null);

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

  // Session changes modal state
  const [showChangesModal, setShowChangesModal] = useState(false);
  const [sessionDiff, setSessionDiff] = useState<SessionDiff | null>(null);
  const [pendingWorkoutNotes, setPendingWorkoutNotes] = useState<string>('');
  const [isUpdatingProgram, setIsUpdatingProgram] = useState(false);

  // Exercise info modal state
  const [exerciseInfoModal, setExerciseInfoModal] = useState<{
    exerciseId: number;
    exerciseName: string;
    videoUrl: string | null;
    description: string;
    muscleGroups: string;
    equipment: string;
  } | null>(null);

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
      if (!isOpenAIInitialized()) return;
      if (coachingLoading.has(exerciseId)) return;
      if (exerciseCoaching.has(exerciseId)) return;

      setCoachingLoading((prev) => new Set(prev).add(exerciseId));

      try {
        const [history, notes] = await Promise.all([
          getRecentExerciseHistoryBySession(exerciseId, 5),
          getExerciseNotes(exerciseId),
        ]);

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
          notes,
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
    [
      coachingLoading,
      exerciseCoaching,
      getExerciseNotes,
      getRecentExerciseHistoryBySession,
    ],
  );

  // Fetch coaching when exercises load
  useEffect(() => {
    if (!isOpenAIInitialized() || exercisesWithSets.length === 0) return;

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

  // Exercise info modal handler
  const handleOpenExerciseInfo = useCallback(
    (exerciseId: number, exerciseName: string) => {
      const exercise = allExercises.find((e) => e.id === exerciseId);
      if (exercise) {
        setExerciseInfoModal({
          exerciseId,
          exerciseName,
          videoUrl: exercise.video_url,
          description: exercise.description,
          muscleGroups: exercise.muscle_groups,
          equipment: exercise.equipment,
        });
      }
    },
    [allExercises],
  );

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

  // Wrapper for uncompleting all sets in a superset round
  const onUncompleteRound = async (
    exerciseIndices: number[],
    roundNumber: number,
  ) => {
    for (const exerciseIndex of exerciseIndices) {
      await handleUncompleteSet(exerciseIndex, roundNumber);
    }
  };

  // End/Cancel workout handlers

  // Check for changes between current session and program template
  const checkForSessionChanges =
    useCallback(async (): Promise<SessionDiff | null> => {
      if (!activeWorkout?.session_id) {
        // Not started from a program session, no comparison needed
        return null;
      }

      try {
        // Get original program exercises
        const programExercises = await getSessionExercises(
          activeWorkout.session_id,
        );

        if (programExercises.length === 0) {
          // No program exercises to compare against
          return null;
        }

        // Get current workout log exercises
        const workoutLogExercises = await getWorkoutLogExercises(
          activeWorkout.id,
        );

        // Create a map of actual set counts from exercisesWithSets
        const exerciseSetCounts = new Map<number, number>();
        exercisesWithSets.forEach((ex) => {
          exerciseSetCounts.set(ex.workoutLogExercise.id, ex.sets.length);
        });

        // Compare
        const diff = compareSessionToProgram(
          programExercises,
          workoutLogExercises,
          exerciseSetCounts,
        );

        return diff.hasChanges ? diff : null;
      } catch (err) {
        console.error('Failed to check for session changes:', err);
        return null;
      }
    }, [
      activeWorkout,
      exercisesWithSets,
      getSessionExercises,
      getWorkoutLogExercises,
    ]);

  const onEndWorkout = async (data: WorkoutNotesFormData) => {
    // Check if there are changes to the program
    const diff = await checkForSessionChanges();

    if (diff && diff.hasChanges) {
      // Store the notes and show the changes modal
      setPendingWorkoutNotes(data.notes || '');
      setSessionDiff(diff);
      setShowEndWorkout(false);
      setShowChangesModal(true);
    } else {
      // No changes, just end the workout
      await handleEndWorkout(data.notes || undefined);
      resetNotesForm();
      navigate('/workout');
    }
  };

  // Handle "Save This Session Only" - just end workout without updating program
  const handleSaveThisSessionOnly = async () => {
    await handleEndWorkout(pendingWorkoutNotes || undefined);
    resetNotesForm();
    setShowChangesModal(false);
    setSessionDiff(null);
    setPendingWorkoutNotes('');
    navigate('/workout');
  };

  // Handle "Update Program Template" - sync changes then end workout
  const handleUpdateProgramTemplate = async () => {
    if (!activeWorkout?.session_id) return;

    setIsUpdatingProgram(true);
    try {
      // Get current workout log exercises
      const workoutLogExercises = await getWorkoutLogExercises(
        activeWorkout.id,
      );

      // Create a map of actual set counts
      const exerciseSetCounts = new Map<number, number>();
      exercisesWithSets.forEach((ex) => {
        exerciseSetCounts.set(ex.workoutLogExercise.id, ex.sets.length);
      });

      // Sync changes to program
      await syncSessionToProgram(
        activeWorkout.session_id,
        workoutLogExercises,
        exerciseSetCounts,
      );

      // End the workout
      await handleEndWorkout(pendingWorkoutNotes || undefined);
      resetNotesForm();
      setShowChangesModal(false);
      setSessionDiff(null);
      setPendingWorkoutNotes('');
      navigate('/workout');
    } catch (err) {
      console.error('Failed to update program:', err);
    } finally {
      setIsUpdatingProgram(false);
    }
  };

  const onCancelWorkout = async () => {
    await handleCancelWorkout();
    navigate('/workout');
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
            const supersetGroupId =
              item[0]?.workoutLogExercise.superset_group_id;

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
                    isLoading={isLoading}
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
                    onUncompleteRound={(roundNumber) =>
                      onUncompleteRound(exerciseIndices, roundNumber)
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
                    onExerciseNameClick={(exerciseId, exerciseName) => {
                      handleOpenExerciseInfo(exerciseId, exerciseName);
                    }}
                    onBreakSuperset={
                      supersetGroupId
                        ? () => handleBreakSuperset(supersetGroupId)
                        : undefined
                    }
                    getExerciseId={getExerciseId}
                  />
                </CardContent>
              </Card>
            );
          }

          // Single exercise
          const exerciseIndex = exercisesWithSets.indexOf(item);
          const exerciseId = getExerciseId(item);
          const isInSuperset = !!item.workoutLogExercise.superset_group_id;

          return (
            <Card
              key={`exercise-${item.exercise.id}`}
              className={
                linkSupersetSelection === exerciseIndex
                  ? 'border-purple-500/50 bg-purple-900/10'
                  : ''
              }
            >
              <CardContent className="p-3">
                <ExerciseCard
                  exerciseData={item}
                  exerciseIndex={exerciseIndex}
                  coaching={exerciseCoaching.get(exerciseId)}
                  isSelectedForLink={linkSupersetSelection === exerciseIndex}
                  isLoading={isLoading}
                  onToggleExpand={() => toggleExerciseExpand(exerciseIndex)}
                  onSetChange={(setIndex, field, value) =>
                    handleSetChange(exerciseIndex, setIndex, field, value)
                  }
                  onCompleteSet={(setIndex) =>
                    onCompleteSet(exerciseIndex, setIndex)
                  }
                  onUncompleteSet={(setIndex) =>
                    handleUncompleteSet(exerciseIndex, setIndex)
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
                  onExerciseNameClick={() => {
                    handleOpenExerciseInfo(exerciseId, item.exercise.name);
                  }}
                  onRemoveExercise={() => handleRemoveExercise(exerciseIndex)}
                  onLinkExercise={
                    !isInSuperset
                      ? () => {
                          if (linkSupersetSelection === null) {
                            // First selection - mark this exercise
                            setLinkSupersetSelection(exerciseIndex);
                          } else if (linkSupersetSelection === exerciseIndex) {
                            // Clicking same exercise - deselect
                            setLinkSupersetSelection(null);
                          } else {
                            // Second selection - create superset
                            handleLinkExercisesAsSuperset([
                              linkSupersetSelection,
                              exerciseIndex,
                            ]);
                            setLinkSupersetSelection(null);
                          }
                        }
                      : undefined
                  }
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Link superset hint */}
      {linkSupersetSelection !== null && (
        <div className="p-3 bg-purple-900/30 border border-purple-500/30 rounded-lg flex items-center justify-between">
          <div className="text-sm text-purple-300">
            <Combine size={14} className="inline mr-2" />
            Select another exercise to create superset
          </div>
          <button
            type="button"
            onClick={() => setLinkSupersetSelection(null)}
            className="text-xs text-slate-400 hover:text-white px-2 py-1"
          >
            Cancel
          </button>
        </div>
      )}

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
          setSupersetSelection([]);
        }}
        title={
          supersetSelection.length > 0
            ? `Add Superset (${supersetSelection.length} selected)`
            : 'Add Exercise'
        }
      >
        <Input
          placeholder="Search exercises..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="mb-4"
        />

        {/* Selection info and actions */}
        {supersetSelection.length > 0 && (
          <div className="mb-4 p-3 bg-purple-900/30 border border-purple-500/30 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-purple-300">
                <Combine size={14} className="inline mr-1" />
                {supersetSelection.length} exercise
                {supersetSelection.length > 1 ? 's' : ''} selected
              </span>
              <button
                type="button"
                onClick={() => setSupersetSelection([])}
                className="text-xs text-slate-400 hover:text-white"
              >
                Clear
              </button>
            </div>
            <div className="text-xs text-slate-400 mb-2">
              {supersetSelection.map((ex) => ex.name).join(' + ')}
            </div>
            {supersetSelection.length >= 2 && (
              <Button
                className="w-full"
                onClick={async () => {
                  const supersetId = generateSupersetId();
                  for (const exercise of supersetSelection) {
                    await handleAddExercise(exercise, supersetId);
                  }
                  setShowAddExercise(false);
                  setSearchQuery('');
                  setSupersetSelection([]);
                }}
              >
                <Combine size={16} className="mr-2" />
                Add as Superset
              </Button>
            )}
            {supersetSelection.length === 1 && (
              <p className="text-xs text-slate-500 text-center">
                Select 1 more exercise for superset
              </p>
            )}
          </div>
        )}

        <div className="max-h-80 overflow-y-auto space-y-2">
          {filteredExercises.map((exercise) => {
            const isSelected = supersetSelection.some(
              (ex) => ex.id === exercise.id,
            );

            return (
              <button
                key={exercise.id}
                type="button"
                onClick={() => {
                  if (isSelected) {
                    // Deselect
                    setSupersetSelection((prev) =>
                      prev.filter((ex) => ex.id !== exercise.id),
                    );
                  } else if (supersetSelection.length > 0) {
                    // Add to superset selection
                    setSupersetSelection((prev) => [...prev, exercise]);
                  } else {
                    // No selection mode - add single exercise
                    handleAddExercise(exercise);
                    setShowAddExercise(false);
                    setSearchQuery('');
                  }
                }}
                onContextMenu={(e) => {
                  // Long press / right click to start superset selection
                  e.preventDefault();
                  if (!isSelected) {
                    setSupersetSelection((prev) => [...prev, exercise]);
                  }
                }}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  isSelected
                    ? 'bg-purple-900/50 border border-purple-500/50'
                    : 'bg-slate-800 hover:bg-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isSelected ? (
                    <Check size={16} className="text-purple-400" />
                  ) : exercise.exercise_type === 'duration' ||
                    exercise.exercise_type === 'duration_weight' ? (
                    <Clock size={16} className="text-slate-400" />
                  ) : (
                    <Dumbbell size={16} className="text-slate-400" />
                  )}
                  <span className="font-medium text-white">
                    {exercise.name}
                  </span>
                  {supersetSelection.length === 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSupersetSelection([exercise]);
                      }}
                      className="ml-auto p-1 text-slate-500 hover:text-purple-400 hover:bg-purple-900/30 rounded"
                      title="Start superset"
                    >
                      <Combine size={14} />
                    </button>
                  )}
                </div>
                {exercise.muscle_groups && (
                  <p className="text-xs text-slate-400 mt-1">
                    {exercise.muscle_groups}
                  </p>
                )}
              </button>
            );
          })}
          {filteredExercises.length === 0 && (
            <p className="text-center text-slate-400 py-4">
              No exercises found
            </p>
          )}
        </div>

        {/* Hint for superset mode */}
        {supersetSelection.length === 0 && (
          <p className="text-xs text-slate-500 text-center mt-3">
            Tap <Combine size={10} className="inline mx-1" /> to create a
            superset
          </p>
        )}
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

      {/* Session Changes Modal */}
      {sessionDiff && (
        <SessionChangesModal
          isOpen={showChangesModal}
          onClose={() => {
            setShowChangesModal(false);
            setSessionDiff(null);
            setPendingWorkoutNotes('');
          }}
          diff={sessionDiff}
          onSaveThisSessionOnly={handleSaveThisSessionOnly}
          onUpdateProgram={handleUpdateProgramTemplate}
          isUpdating={isUpdatingProgram}
        />
      )}

      {/* Exercise Info Modal */}
      <Modal
        isOpen={!!exerciseInfoModal}
        onClose={() => setExerciseInfoModal(null)}
        title={exerciseInfoModal?.exerciseName || 'Exercise Info'}
      >
        {exerciseInfoModal && (
          <div className="space-y-4">
            {/* Description */}
            {exerciseInfoModal.description && (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-1">
                  Description
                </h4>
                <p className="text-slate-300 text-sm">
                  {exerciseInfoModal.description}
                </p>
              </div>
            )}

            {/* Muscle Groups */}
            {exerciseInfoModal.muscleGroups && (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-1">
                  Muscle Groups
                </h4>
                <p className="text-slate-300 text-sm">
                  {exerciseInfoModal.muscleGroups}
                </p>
              </div>
            )}

            {/* Equipment */}
            {exerciseInfoModal.equipment && (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-1">
                  Equipment
                </h4>
                <p className="text-slate-300 text-sm">
                  {exerciseInfoModal.equipment}
                </p>
              </div>
            )}

            {/* Tutorial Link */}
            <div>
              <h4 className="text-sm font-medium text-slate-400 mb-2">
                Tutorial
              </h4>
              {exerciseInfoModal.videoUrl ? (
                <a
                  href={exerciseInfoModal.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <Play size={16} />
                  Watch Tutorial
                </a>
              ) : (
                <a
                  href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                    `${exerciseInfoModal.exerciseName} exercise form tutorial`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  <Play size={16} />
                  Search on YouTube
                </a>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
