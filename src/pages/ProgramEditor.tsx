import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Save, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AddExerciseModal } from '../components/program-editor/AddExerciseModal';
import { FillSessionModal } from '../components/program-editor/FillSessionModal';
import { GenerateProgramModal } from '../components/program-editor/GenerateProgramModal';
import { OptimizeModal } from '../components/program-editor/OptimizeModal';
import {
  appendFilledExercises,
  applyOptimizationResult,
  buildOptimizationInput,
  newFillExercises,
  type OptimizePreferences,
  programExerciseRequests,
} from '../components/program-editor/optimize';
import { SessionCard } from '../components/program-editor/SessionCard';
import { saveProgram } from '../components/program-editor/saveProgram';
import {
  type ExerciseFormData,
  generateSupersetId,
  isDurationType,
  type ProgramFormData,
  programFormSchema,
  type SupersetSelection,
} from '../components/program-editor/schema';
import {
  deleteExercise,
  linkExercises,
} from '../components/program-editor/supersets';
import { SubpageHeader } from '../components/training/SubpageHeader';
import {
  Button,
  Card,
  ConfirmModal,
  Input,
  Skeleton,
  TextArea,
} from '../components/ui';
import { useAppStore } from '../hooks/useAppStore';
import { useExercises } from '../hooks/useExercises';
import { useProfile } from '../hooks/useProfile';
import type { GeneratedDraft } from '../hooks/useProgramGenerator';
import { useWorkoutPrograms } from '../hooks/useWorkoutPrograms';
import { getAICapability } from '../services/ai/useAICapability';
import {
  fillSessionExercises,
  optimizeWorkoutProgram,
} from '../services/coaching/programCoach';
import { getDB } from '../services/db';
import {
  type ExerciseDetailsFetcher,
  type ExerciseRequest,
  resolveExercises,
} from '../services/writers/exerciseResolver';
import type {
  AIExerciseResponse,
  AIProgramGeneratorResponse,
  Exercise,
} from '../types';

// An applied AI draft: what to show, and the form to restore on Undo.
interface AIDraftResult {
  recommendations: string[];
  snapshot: ProgramFormData;
}

const NO_EXERCISES_ERROR =
  'The AI returned no exercises, so nothing was changed. Please try again.';

export function ProgramEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isEditing = !!id && id !== 'new';
  const isOnline = useAppStore((state) => state.isOnline);

  const programsApi = useWorkoutPrograms();
  const { getProgramById, loading } = programsApi;
  const { exercises: allExercises, fetchExercises } = useExercises();
  const { profile } = useProfile();

  const [loadingProgram, setLoadingProgram] = useState(isEditing);
  const [showAddExercise, setShowAddExercise] = useState<number | null>(null);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [selectedForSuperset, setSelectedForSuperset] =
    useState<SupersetSelection | null>(null);
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [fillSessionIndex, setFillSessionIndex] = useState<number | null>(null);
  const [isFilling, setIsFilling] = useState(false);
  const [fillError, setFillError] = useState<string | null>(null);
  const [aiResult, setAIResult] = useState<AIDraftResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors, isDirty },
  } = useForm<ProgramFormData>({
    resolver: zodResolver(programFormSchema),
    defaultValues: {
      name: '',
      description: '',
      sessions: [],
    },
  });

  const {
    fields: sessionFields,
    append: appendSession,
    remove: removeSession,
    update: updateSessionField,
  } = useFieldArray({
    control,
    name: 'sessions',
  });

  const watchedSessions = useWatch({ control, name: 'sessions' });

  const muscleGroupsById = useMemo(
    () => new Map(allExercises.map((e) => [e.id, e.muscle_groups])),
    [allExercises],
  );

  const loadProgram = useCallback(
    async (programId: number) => {
      setLoadingProgram(true);
      const program = await getProgramById(programId);
      setLoadingProgram(false);
      if (program) {
        reset({
          name: program.name,
          description: program.description || '',
          sessions: program.sessions.map((session) => ({
            id: session.id,
            name: session.name,
            dayOfWeek: session.day_of_week?.toString() ?? '',
            isExpanded: true,
            exercises: session.exercises.map((ex) => ({
              id: ex.id,
              exerciseId: ex.exercise_id,
              exerciseName: ex.exercise_name,
              exerciseType: ex.exercise_type || 'reps_weight',
              targetSets: ex.target_sets,
              targetRepMin: ex.target_rep_min,
              targetRepMax: ex.target_rep_max,
              targetDurationSeconds: ex.target_duration_seconds,
              supersetGroupId: ex.superset_group_id,
              notes: ex.notes || '',
            })),
          })),
        });
      }
    },
    [getProgramById, reset],
  );

  useEffect(() => {
    fetchExercises();

    if (isEditing) {
      loadProgram(parseInt(id, 10));
    }
  }, [id, isEditing, fetchExercises, loadProgram]);

  // "Generate with AI" from the Workout page lands here with ?ai=1.
  useEffect(() => {
    if (searchParams.get('ai') === '1') {
      setShowGenerate(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Resolve AI exercise names to library rows, creating the missing ones.
  // Details come from the AI only when it can be reached.
  const resolve = async (requests: ExerciseRequest[]) => {
    const library = await fetchExercises();
    const fetcher: ExerciseDetailsFetcher | undefined =
      getAICapability().available && isOnline ? undefined : async () => [];
    const resolved = await resolveExercises(
      await getDB(),
      requests,
      library,
      fetcher,
    );
    fetchExercises();
    return resolved;
  };

  // Replace the form with an AI program (generate / improve). The previous
  // form is kept for Undo; keepDefaultValues leaves the form dirty so the
  // discard guard still applies.
  const applyAIProgram = async (
    program: AIProgramGeneratorResponse,
    created: AIExerciseResponse[] = [],
  ) => {
    if (!program.sessions.some((s) => s.exercises.length > 0)) {
      throw new Error(NO_EXERCISES_ERROR);
    }
    const snapshot = getValues();
    const resolved = await resolve(programExerciseRequests(program, created));
    reset(applyOptimizationResult(program, resolved), {
      keepDefaultValues: true,
    });
    setSelectedForSuperset(null);
    setAIResult({ recommendations: program.recommendations ?? [], snapshot });
  };

  const handleGenerated = async (draft: GeneratedDraft) => {
    await applyAIProgram(draft.program, draft.exercisesToCreate);
    setShowGenerate(false);
  };

  const handleUndoAI = () => {
    if (!aiResult) return;
    reset(aiResult.snapshot, { keepDefaultValues: true });
    setSelectedForSuperset(null);
    setAIResult(null);
  };

  const aiUnavailableMessage = () =>
    !profile
      ? 'Please set up your profile first in Settings.'
      : !getAICapability().available
        ? 'Please add your OpenRouter API key in Settings to use AI features.'
        : !isOnline
          ? 'You are offline. Connect to use AI features.'
          : null;

  const handleFill = async (instruction: string) => {
    if (fillSessionIndex === null || isFilling) return;
    const unavailable = aiUnavailableMessage();
    if (unavailable || !profile) {
      setFillError(unavailable);
      return;
    }
    const sessionIndex = fillSessionIndex;
    const session = getValues(`sessions.${sessionIndex}`);
    setIsFilling(true);
    setFillError(null);
    try {
      const { exercises } = await fillSessionExercises({
        sessionName: session.name,
        instruction,
        existing: session.exercises.map((e) => ({ name: e.exerciseName })),
        library: allExercises,
        profile,
      });
      const added = newFillExercises(session.exercises, exercises);
      if (added.length === 0) {
        setFillError(
          'The AI did not suggest anything new for this session. Try describing it differently.',
        );
        return;
      }
      const snapshot = getValues();
      const resolved = await resolve(added.map((e) => ({ name: e.name })));
      setValue(
        `sessions.${sessionIndex}.exercises`,
        appendFilledExercises(session.exercises, added, resolved),
        { shouldDirty: true },
      );
      setAIResult({ recommendations: [], snapshot });
      setFillSessionIndex(null);
    } catch (err) {
      console.error('Fill session failed:', err);
      setFillError(
        err instanceof Error
          ? err.message
          : 'Could not add exercises. Please try again.',
      );
    } finally {
      setIsFilling(false);
    }
  };

  const handleCreateExercise = async (name: string) => {
    if (showAddExercise === null) return;
    const sessionIndex = showAddExercise;
    const resolved = await resolve([{ name }]);
    const [exercise] = resolved.values();
    if (exercise) handleAddExercise(sessionIndex, exercise);
  };

  const handleBack = () => {
    if (isDirty) {
      setShowDiscardModal(true);
    } else {
      navigate('/workout');
    }
  };

  const handleAddSession = () => {
    appendSession({
      name: `Session ${sessionFields.length + 1}`,
      dayOfWeek: '',
      isExpanded: true,
      exercises: [],
    });
  };

  const handleToggleExpand = (index: number) => {
    const currentSession = watchedSessions[index];
    if (currentSession) {
      updateSessionField(index, {
        ...currentSession,
        isExpanded: !currentSession.isExpanded,
      });
    }
  };

  const handleAddExercise = (sessionIndex: number, exercise: Exercise) => {
    const currentSession = watchedSessions[sessionIndex];
    if (currentSession) {
      const isDuration = isDurationType(exercise.exercise_type);

      const newExercise: ExerciseFormData = {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        exerciseType: exercise.exercise_type || 'reps_weight',
        targetSets: 3,
        targetRepMin: isDuration ? null : 8,
        targetRepMax: isDuration ? null : 12,
        targetDurationSeconds: isDuration ? 30 : null,
        supersetGroupId: null,
        notes: '',
      };

      updateSessionField(sessionIndex, {
        ...currentSession,
        exercises: [...currentSession.exercises, newExercise],
      });
    }
    setShowAddExercise(null);
  };

  const handleDeleteExercise = (
    sessionIndex: number,
    exerciseIndex: number,
  ) => {
    const currentSession = watchedSessions[sessionIndex];
    if (currentSession) {
      // A superset left with one member dissolves.
      const updatedExercises = deleteExercise(
        currentSession.exercises,
        exerciseIndex,
      );

      // Properly update the form field to unregister deleted exercise
      setValue(`sessions.${sessionIndex}.exercises`, updatedExercises, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
    // Keep the superset selection pointing at the same exercise: clear it if
    // that one was deleted, shift it if an earlier one was.
    if (selectedForSuperset?.sessionIndex === sessionIndex) {
      if (selectedForSuperset.exerciseIndex === exerciseIndex) {
        setSelectedForSuperset(null);
      } else if (selectedForSuperset.exerciseIndex > exerciseIndex) {
        setSelectedForSuperset({
          sessionIndex,
          exerciseIndex: selectedForSuperset.exerciseIndex - 1,
        });
      }
    }
  };

  const handleCreateSuperset = (
    sessionIndex: number,
    exerciseIndex: number,
  ) => {
    if (selectedForSuperset === null) {
      // First exercise selected
      setSelectedForSuperset({ sessionIndex, exerciseIndex });
    } else if (
      selectedForSuperset.sessionIndex === sessionIndex &&
      selectedForSuperset.exerciseIndex !== exerciseIndex
    ) {
      // Second exercise selected in same session (and NOT the same exercise):
      // link them, joining an existing superset if either is in one.
      const currentSession = watchedSessions[sessionIndex];
      if (currentSession) {
        updateSessionField(sessionIndex, {
          ...currentSession,
          exercises: linkExercises(
            currentSession.exercises,
            selectedForSuperset.exerciseIndex,
            exerciseIndex,
            generateSupersetId,
          ),
        });
      }
      setSelectedForSuperset(null);
    } else if (
      selectedForSuperset.sessionIndex === sessionIndex &&
      selectedForSuperset.exerciseIndex === exerciseIndex
    ) {
      // Same exercise clicked again - cancel selection
      setSelectedForSuperset(null);
    } else {
      // Different session - reset and select new
      setSelectedForSuperset({ sessionIndex, exerciseIndex });
    }
  };

  // Break entire superset - removes superset_group_id from ALL exercises in the group
  const handleBreakSuperset = (
    sessionIndex: number,
    supersetGroupId: string,
  ) => {
    const currentSession = watchedSessions[sessionIndex];
    if (currentSession) {
      const updatedExercises = currentSession.exercises.map((exercise) => {
        if (exercise.supersetGroupId === supersetGroupId) {
          return { ...exercise, supersetGroupId: null };
        }
        return exercise;
      });
      updateSessionField(sessionIndex, {
        ...currentSession,
        exercises: updatedExercises,
      });
    }
  };

  // Update target sets for all exercises in a superset
  const handleUpdateSupersetSets = (
    sessionIndex: number,
    supersetGroupId: string,
    newTargetSets: number,
  ) => {
    const currentSession = watchedSessions[sessionIndex];
    if (currentSession) {
      const updatedExercises = currentSession.exercises.map((exercise) => {
        if (exercise.supersetGroupId === supersetGroupId) {
          return { ...exercise, targetSets: newTargetSets };
        }
        return exercise;
      });
      updateSessionField(sessionIndex, {
        ...currentSession,
        exercises: updatedExercises,
      });
    }
  };

  const onSubmit = async (data: ProgramFormData) => {
    if (data.sessions.length === 0) {
      setSaveError('Add at least one session before saving.');
      return;
    }

    if (isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await saveProgram(
        await getDB(),
        data,
        isEditing ? parseInt(id, 10) : null,
      );
      navigate('/workout');
    } catch (err) {
      console.error('Failed to save program:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Check for database schema issue
      if (
        errorMessage.includes('not-null constraint') ||
        errorMessage.includes('target_rep_min')
      ) {
        setSaveError(
          'The database needs updating. Hard refresh the page; if that does not help, use Reset Database in Settings (this clears all your data).',
        );
      } else {
        setSaveError(`Failed to save program: ${errorMessage}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Handle AI improvement
  const handleOptimize = async (prefs: OptimizePreferences) => {
    const unavailable = aiUnavailableMessage();
    if (unavailable || !profile) {
      setOptimizeError(unavailable);
      return;
    }

    setIsOptimizing(true);
    setOptimizeError(null);

    try {
      const input = buildOptimizationInput(
        profile,
        {
          name: getValues('name') || 'My Program',
          description: getValues('description') || '',
        },
        watchedSessions,
        allExercises,
        prefs,
      );
      const result = await optimizeWorkoutProgram(input);
      await applyAIProgram(result);
      setShowOptimizeModal(false);
    } catch (error) {
      console.error('Optimization failed:', error);
      setOptimizeError(
        error instanceof Error
          ? error.message
          : 'Failed to improve program. Please try again.',
      );
    } finally {
      setIsOptimizing(false);
    }
  };

  const closeOptimizeModal = () => {
    if (!isOptimizing) {
      setShowOptimizeModal(false);
      setOptimizeError(null);
    }
  };

  return (
    <div>
      <SubpageHeader
        title={isEditing ? 'Edit Program' : 'New Program'}
        onBack={handleBack}
      />

      {/* Superset selection hint */}
      {selectedForSuperset !== null && (
        <div
          role="status"
          className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 px-4 py-3 bg-train-soft border-b border-train text-train-ink text-sm"
        >
          Click another exercise in this session to create a superset, or click
          the same exercise to cancel.
        </div>
      )}

      {loadingProgram ? (
        <div className="px-4 py-4 space-y-4" aria-busy="true">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="px-4 py-4 space-y-4">
            {/* Program info */}
            <Card>
              <div className="p-4 space-y-4">
                <Input
                  id="programName"
                  label="Program Name"
                  {...register('name')}
                  placeholder="e.g., Push Pull Legs"
                  error={errors.name?.message}
                />
                <TextArea
                  id="programDescription"
                  label="Description (optional)"
                  {...register('description')}
                  placeholder="Describe your program..."
                  rows={2}
                />
              </div>
            </Card>

            {/* AI: generate an empty program, improve a filled one */}
            <div className="flex items-center gap-3 p-4 rounded-xl bg-sunken">
              <p className="flex-1 text-sm text-ink-2">
                {sessionFields.length === 0
                  ? 'Describe your goals and let AI build the sessions.'
                  : 'Let AI rebalance volume, order and exercise choice.'}
              </p>
              <Button
                tone="ink"
                type="button"
                size="sm"
                className="shrink-0 h-11"
                onClick={() =>
                  sessionFields.length === 0
                    ? setShowGenerate(true)
                    : setShowOptimizeModal(true)
                }
                disabled={isOptimizing}
              >
                <Sparkles size={18} aria-hidden="true" />
                {sessionFields.length === 0
                  ? 'Generate with AI'
                  : 'Improve with AI'}
              </Button>
            </div>

            {aiResult && (
              <div
                role="status"
                className="flex gap-2 pl-4 pr-1 py-1 rounded-xl bg-sunken"
              >
                <div className="flex-1 py-3 space-y-2">
                  <p className="font-semibold text-ink">
                    AI draft applied. Review, then save.
                  </p>
                  {aiResult.recommendations.length > 0 && (
                    <ul className="list-disc pl-5 space-y-1 text-sm text-ink-2">
                      {aiResult.recommendations.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-11"
                    onClick={handleUndoAI}
                  >
                    Undo
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => setAIResult(null)}
                  aria-label="Dismiss"
                  className="grid place-items-center size-11 shrink-0 rounded-full text-ink-2 hover:text-ink hover:bg-sunken-strong"
                >
                  <X size={18} />
                </button>
              </div>
            )}

            {/* Sessions */}
            <section className="space-y-2 pt-2">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-bold text-ink">Sessions</h2>
                <span className="text-ink-3 text-sm">
                  <span className="num">{sessionFields.length}</span>{' '}
                  {sessionFields.length === 1 ? 'session' : 'sessions'}/week
                </span>
              </div>

              {sessionFields.length === 0 ? (
                <Card>
                  <div className="p-4">
                    <p className="text-ink-2 mb-3">
                      No sessions yet. Add one to start building the program.
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full"
                      onClick={handleAddSession}
                    >
                      <Plus size={18} aria-hidden="true" />
                      Add Session
                    </Button>
                  </div>
                </Card>
              ) : (
                <div className="space-y-3">
                  {sessionFields.map((sessionField, sessionIndex) => (
                    <SessionCard
                      key={sessionField.id}
                      session={watchedSessions[sessionIndex]}
                      sessionIndex={sessionIndex}
                      sessionFieldId={sessionField.id}
                      register={register}
                      selectedForSuperset={selectedForSuperset}
                      muscleGroupsById={muscleGroupsById}
                      onToggleExpand={() => handleToggleExpand(sessionIndex)}
                      onRemove={() => removeSession(sessionIndex)}
                      onAddExercise={() => setShowAddExercise(sessionIndex)}
                      onFillWithAI={() => {
                        setFillError(null);
                        setFillSessionIndex(sessionIndex);
                      }}
                      onDeleteExercise={(exerciseIndex) =>
                        handleDeleteExercise(sessionIndex, exerciseIndex)
                      }
                      onSupersetTap={(exerciseIndex) =>
                        handleCreateSuperset(sessionIndex, exerciseIndex)
                      }
                      onBreakSuperset={(supersetId) =>
                        handleBreakSuperset(sessionIndex, supersetId)
                      }
                      onSupersetSetsChange={(supersetId, sets) =>
                        handleUpdateSupersetSets(sessionIndex, supersetId, sets)
                      }
                    />
                  ))}

                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={handleAddSession}
                  >
                    <Plus size={18} aria-hidden="true" />
                    Add Session
                  </Button>
                </div>
              )}
            </section>
          </div>

          {/* Save: pinned at thumb height */}
          <div className="sticky bottom-0 z-20 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-canvas border-t border-line">
            {saveError && (
              <p role="alert" className="mb-2 text-sm text-danger">
                {saveError}
              </p>
            )}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={loading || isSaving}
            >
              <Save size={20} aria-hidden="true" />
              {isEditing ? 'Save Changes' : 'Create Program'}
            </Button>
          </div>
        </form>
      )}

      <AddExerciseModal
        isOpen={showAddExercise !== null}
        exercises={allExercises}
        onClose={() => setShowAddExercise(null)}
        onPick={(exercise: Exercise) =>
          showAddExercise !== null &&
          handleAddExercise(showAddExercise, exercise)
        }
        onCreate={handleCreateExercise}
        onManageLibrary={() => navigate('/exercises')}
      />

      <ConfirmModal
        isOpen={showDiscardModal}
        onClose={() => setShowDiscardModal(false)}
        title="Discard Changes?"
        cancelLabel="Keep Editing"
        confirmLabel="Discard"
        onConfirm={() => navigate('/workout')}
        danger
      >
        You have unsaved changes. Are you sure you want to discard them?
      </ConfirmModal>

      <OptimizeModal
        isOpen={showOptimizeModal}
        onClose={closeOptimizeModal}
        isOptimizing={isOptimizing}
        error={optimizeError}
        canOptimize={!!profile}
        onOptimize={handleOptimize}
      />

      <GenerateProgramModal
        isOpen={showGenerate}
        onClose={() => setShowGenerate(false)}
        onGenerated={handleGenerated}
      />

      <FillSessionModal
        sessionName={
          fillSessionIndex === null
            ? null
            : (watchedSessions[fillSessionIndex]?.name ?? '')
        }
        isFilling={isFilling}
        error={fillError}
        onClose={() => setFillSessionIndex(null)}
        onFill={handleFill}
      />
    </div>
  );
}
