import { zodResolver } from '@hookform/resolvers/zod';
import { Combine, Flag, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AddExerciseModal,
  CancelWorkoutModal,
  EndWorkoutModal,
  type ExerciseInfo,
  ExerciseInfoModal,
  type ExerciseNotesData,
  ExerciseNotesModal,
  SessionBar,
  SessionExerciseList,
  useExerciseCoaching,
} from '../components/session';
import { Button, Card, Skeleton, SkeletonCard } from '../components/ui';
import {
  DurationTimer,
  RestTimer,
  SessionChangesModal,
} from '../components/workout';
import { useWeightUnit } from '../hooks/useWeightUnit';
import { useWorkoutLogs } from '../hooks/useWorkoutLogs';
import { useWorkoutPrograms } from '../hooks/useWorkoutPrograms';
import { useWorkoutSession } from '../hooks/useWorkoutSession';
import {
  type WorkoutNotesFormData,
  workoutNotesSchema,
} from '../schemas/forms';
import { parseLocalTimestamp } from '../utils/date';
import {
  compareSessionToProgram,
  type SessionDiff,
} from '../utils/sessionDiff';
import { unitLabel } from '../utils/units';

export function WorkoutSession() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Get optional date override from query params (e.g., ?date=2025-01-10)
  const dateOverride = searchParams.get('date') || undefined;

  // Main workout session hook
  const session = useWorkoutSession(dateOverride);
  const weightUnit = useWeightUnit();
  const {
    activeWorkout,
    exercisesWithSets,
    allExercises,
    libraryExercises,
    totalCompletedSets,
    isInitialized,
    handleCompleteSet,
    handleUncompleteSet,
    handleCompleteRound,
    handleAddExercise,
    saveDurationSet,
    handleEndWorkout,
    handleCancelWorkout,
    getExerciseId,
  } = session;

  // Exercise notes from useWorkoutLogs
  const {
    addExerciseNote,
    getExerciseNotes,
    deleteExerciseNote,
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

  // AI coaching tips per exercise (needs an AI key; silent otherwise)
  const exerciseCoaching = useExerciseCoaching(
    exercisesWithSets,
    getExerciseId,
    getExerciseNotes,
  );

  // Exercise notes modal state
  const [exerciseNotesModal, setExerciseNotesModal] =
    useState<ExerciseNotesData | null>(null);

  // Session changes modal state
  const [showChangesModal, setShowChangesModal] = useState(false);
  const [sessionDiff, setSessionDiff] = useState<SessionDiff | null>(null);
  const [pendingWorkoutNotes, setPendingWorkoutNotes] = useState<string>('');
  const [isUpdatingProgram, setIsUpdatingProgram] = useState(false);

  // Exercise info modal state
  const [exerciseInfoModal, setExerciseInfoModal] =
    useState<ExerciseInfo | null>(null);

  // Wake lock ref
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

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

  const handleAddNote = async (content: string) => {
    if (!exerciseNotesModal || !content.trim()) return;

    let noteContent = content.trim();
    if (
      exerciseNotesModal.currentWeight &&
      parseFloat(exerciseNotesModal.currentWeight) > 0
    ) {
      noteContent += ` @ ${exerciseNotesModal.currentWeight} ${unitLabel(weightUnit)}`;
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

    if (diff?.hasChanges) {
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

  if (!isInitialized) {
    return (
      <div className="space-y-4 px-4 py-4" aria-busy="true">
        <Skeleton className="h-16 w-full rounded-xl" />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!activeWorkout) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="mb-4 text-ink-2">
          No active workout found. Start one from Training.
        </p>
        <Button onClick={() => navigate('/workout')}>Go to Workout</Button>
      </div>
    );
  }

  return (
    // Bottom padding clears the docked rest-timer bar.
    <div className="pb-28">
      <SessionBar
        elapsedSeconds={elapsedTime}
        completedSets={totalCompletedSets}
        exerciseCount={exercisesWithSets.length}
        onCancel={() => setShowCancelWorkout(true)}
        onFinish={() => setShowEndWorkout(true)}
      />

      <div className="space-y-4 px-4 py-4">
        {exercisesWithSets.length === 0 && (
          <Card className="px-4 py-8 text-center">
            <p className="mb-4 text-ink-2">
              No exercises in this workout yet. Add one to start logging.
            </p>
            <Button onClick={() => setShowAddExercise(true)}>
              <Plus size={18} />
              Add Exercise
            </Button>
          </Card>
        )}

        <SessionExerciseList
          session={session}
          coachingMap={exerciseCoaching}
          linkSelection={linkSupersetSelection}
          onLinkSelectionChange={setLinkSupersetSelection}
          onCompleteSet={onCompleteSet}
          onCompleteRound={onCompleteRound}
          onUncompleteRound={onUncompleteRound}
          onStartDurationTimer={handleStartDurationTimer}
          onOpenNotes={handleOpenExerciseNotes}
          onOpenInfo={handleOpenExerciseInfo}
        />

        {linkSupersetSelection !== null && (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-sunken py-1 pr-1 pl-3">
            <p className="flex items-center gap-2 text-sm text-ink">
              <Combine size={16} aria-hidden="true" />
              Select another exercise to create superset
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLinkSupersetSelection(null)}
            >
              Cancel
            </Button>
          </div>
        )}

        {exercisesWithSets.length > 0 && (
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => setShowAddExercise(true)}
          >
            <Plus size={18} />
            Add Exercise
          </Button>
        )}

        {/* Finish sits after the work, well apart from set controls, and confirms first. */}
        <div className="border-t border-line pt-6">
          <Button
            size="lg"
            className="w-full"
            onClick={() => setShowEndWorkout(true)}
          >
            <Flag size={18} />
            Finish Workout
          </Button>
        </div>
      </div>

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

      {durationTimerData && (
        <DurationTimer
          targetSeconds={durationTimerData.targetSeconds}
          onComplete={handleDurationComplete}
          onCancel={() => setDurationTimerData(null)}
        />
      )}

      <AddExerciseModal
        isOpen={showAddExercise}
        onClose={() => setShowAddExercise(false)}
        exercises={libraryExercises}
        onAddExercise={handleAddExercise}
      />

      <EndWorkoutModal
        isOpen={showEndWorkout}
        onClose={() => setShowEndWorkout(false)}
        onSubmit={handleSubmit(onEndWorkout)}
        register={register}
        completedSets={totalCompletedSets}
        elapsedSeconds={elapsedTime}
      />

      <CancelWorkoutModal
        isOpen={showCancelWorkout}
        onClose={() => setShowCancelWorkout(false)}
        onConfirm={onCancelWorkout}
      />

      <ExerciseNotesModal
        data={exerciseNotesModal}
        onClose={() => setExerciseNotesModal(null)}
        onAddNote={handleAddNote}
        onDeleteNote={handleDeleteNote}
      />

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

      <ExerciseInfoModal
        info={exerciseInfoModal}
        onClose={() => setExerciseInfoModal(null)}
      />
    </div>
  );
}
