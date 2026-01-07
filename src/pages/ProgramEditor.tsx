import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Save,
  X,
} from 'lucide-react';
import {
  Card,
  CardContent,
  Button,
  Input,
  Modal,
  TextArea,
} from '../components/ui';
import { useWorkoutPrograms } from '../hooks/useWorkoutPrograms';
import { useExercises } from '../hooks/useExercises';
import type { Exercise } from '../types';

const DAY_OPTIONS = [
  { value: '', label: 'Any Day' },
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

// Form schema with nested arrays
const programExerciseFormSchema = z.object({
  id: z.number().optional(),
  exerciseId: z.number(),
  exerciseName: z.string(),
  targetSets: z.number().min(1, 'At least 1 set required'),
  targetRepMin: z.number().min(1, 'At least 1 rep required'),
  targetRepMax: z.number().min(1, 'At least 1 rep required'),
  notes: z.string().optional(),
});

const programSessionFormSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, 'Session name is required'),
  dayOfWeek: z.string(),
  isExpanded: z.boolean(),
  exercises: z.array(programExerciseFormSchema),
});

const programFormSchema = z.object({
  name: z.string().min(1, 'Program name is required'),
  description: z.string().optional(),
  sessions: z.array(programSessionFormSchema),
});

type ProgramFormData = z.infer<typeof programFormSchema>;
type ExerciseFormData = z.infer<typeof programExerciseFormSchema>;

export function ProgramEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = !!id && id !== 'new';

  const {
    getProgramById,
    createProgram,
    updateProgram,
    addSession,
    updateSession,
    deleteSession,
    addProgramExercise,
    updateProgramExercise,
    deleteProgramExercise,
    loading,
  } = useWorkoutPrograms();
  const { exercises: allExercises, fetchExercises } = useExercises();

  const [showAddExercise, setShowAddExercise] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDiscardModal, setShowDiscardModal] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProgramFormData>({
    resolver: zodResolver(programFormSchema),
    defaultValues: {
      name: '',
      description: '',
      sessions: [],
    },
  });

  const { fields: sessionFields, append: appendSession, remove: removeSession, update: updateSessionField } = useFieldArray({
    control,
    name: 'sessions',
  });

  const watchedSessions = useWatch({ control, name: 'sessions' });

  const loadProgram = useCallback(async (programId: number) => {
    const program = await getProgramById(programId);
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
            targetSets: ex.target_sets,
            targetRepMin: ex.target_rep_min,
            targetRepMax: ex.target_rep_max,
            notes: ex.notes || '',
          })),
        })),
      });
    }
  }, [getProgramById, reset]);

  useEffect(() => {
    fetchExercises();

    if (isEditing) {
      loadProgram(parseInt(id));
    }
  }, [id, isEditing, fetchExercises, loadProgram]);

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
      const newExercise: ExerciseFormData = {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        targetSets: 3,
        targetRepMin: 8,
        targetRepMax: 12,
        notes: '',
      };

      updateSessionField(sessionIndex, {
        ...currentSession,
        exercises: [...currentSession.exercises, newExercise],
      });
    }
    setShowAddExercise(null);
    setSearchQuery('');
  };

  const handleDeleteExercise = (sessionIndex: number, exerciseIndex: number) => {
    const currentSession = watchedSessions[sessionIndex];
    if (currentSession) {
      updateSessionField(sessionIndex, {
        ...currentSession,
        exercises: currentSession.exercises.filter((_, i) => i !== exerciseIndex),
      });
    }
  };

  const onSubmit = async (data: ProgramFormData) => {
    if (data.sessions.length === 0) {
      alert('Please add at least one session');
      return;
    }

    try {
      let programId: number;

      if (isEditing) {
        programId = parseInt(id);
        await updateProgram(programId, {
          name: data.name,
          description: data.description || '',
          sessions_per_week: data.sessions.length,
        });

        // Handle sessions
        const existingProgram = await getProgramById(programId);
        const existingSessionIds =
          existingProgram?.sessions.map((s) => s.id) || [];
        const currentSessionIds = data.sessions
          .filter((s) => s.id)
          .map((s) => s.id!);

        // Delete removed sessions
        for (const sessionId of existingSessionIds) {
          if (!currentSessionIds.includes(sessionId)) {
            await deleteSession(sessionId);
          }
        }

        // Update or create sessions
        for (let i = 0; i < data.sessions.length; i++) {
          const session = data.sessions[i];
          let sessionId: number;
          const dayOfWeek = session.dayOfWeek === '' ? null : parseInt(session.dayOfWeek);

          if (session.id) {
            await updateSession(session.id, {
              name: session.name,
              day_of_week: dayOfWeek,
              order_index: i,
            });
            sessionId = session.id;

            // Handle exercises for existing session
            const existingSession = existingProgram?.sessions.find(
              (s) => s.id === session.id,
            );
            const existingExerciseIds =
              existingSession?.exercises.map((e) => e.id) || [];
            const currentExerciseIds = session.exercises
              .filter((e) => e.id)
              .map((e) => e.id!);

            // Delete removed exercises
            for (const exerciseId of existingExerciseIds) {
              if (!currentExerciseIds.includes(exerciseId)) {
                await deleteProgramExercise(exerciseId);
              }
            }

            // Update or create exercises
            for (let j = 0; j < session.exercises.length; j++) {
              const exercise = session.exercises[j];
              if (exercise.id) {
                await updateProgramExercise(exercise.id, {
                  target_sets: exercise.targetSets,
                  target_rep_min: exercise.targetRepMin,
                  target_rep_max: exercise.targetRepMax,
                  order_index: j,
                  notes: exercise.notes || null,
                });
              } else {
                await addProgramExercise(sessionId, {
                  exercise_id: exercise.exerciseId,
                  target_sets: exercise.targetSets,
                  target_rep_min: exercise.targetRepMin,
                  target_rep_max: exercise.targetRepMax,
                  order_index: j,
                  notes: exercise.notes || null,
                });
              }
            }
          } else {
            sessionId = await addSession(programId, {
              name: session.name,
              day_of_week: dayOfWeek,
              order_index: i,
            });

            // Add exercises for new session
            for (let j = 0; j < session.exercises.length; j++) {
              const exercise = session.exercises[j];
              await addProgramExercise(sessionId, {
                exercise_id: exercise.exerciseId,
                target_sets: exercise.targetSets,
                target_rep_min: exercise.targetRepMin,
                target_rep_max: exercise.targetRepMax,
                order_index: j,
                notes: exercise.notes || null,
              });
            }
          }
        }
      } else {
        // Create new program
        programId = await createProgram({
          name: data.name,
          description: data.description || '',
          sessions_per_week: data.sessions.length,
        });

        // Create sessions and exercises
        for (let i = 0; i < data.sessions.length; i++) {
          const session = data.sessions[i];
          const dayOfWeek = session.dayOfWeek === '' ? null : parseInt(session.dayOfWeek);
          const sessionId = await addSession(programId, {
            name: session.name,
            day_of_week: dayOfWeek,
            order_index: i,
          });

          for (let j = 0; j < session.exercises.length; j++) {
            const exercise = session.exercises[j];
            await addProgramExercise(sessionId, {
              exercise_id: exercise.exerciseId,
              target_sets: exercise.targetSets,
              target_rep_min: exercise.targetRepMin,
              target_rep_max: exercise.targetRepMax,
              order_index: j,
              notes: exercise.notes || null,
            });
          }
        }
      }

      navigate('/workout');
    } catch (err) {
      console.error('Failed to save program:', err);
      alert('Failed to save program');
    }
  };

  const filteredExercises = allExercises.filter(
    (ex) =>
      ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ex.muscle_groups?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="p-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          type="button"
          onClick={handleBack}
          className="p-2 text-slate-400 hover:text-white"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold text-white">
          {isEditing ? 'Edit Program' : 'New Program'}
        </h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Program Info */}
        <Card className="mb-4">
          <CardContent className="p-4 space-y-4">
            <div>
              <label htmlFor="programName" className="block text-slate-400 text-sm mb-1">
                Program Name
              </label>
              <Input
                id="programName"
                {...register('name')}
                placeholder="e.g., Push Pull Legs"
                error={errors.name?.message}
              />
            </div>
            <div>
              <label htmlFor="programDescription" className="block text-slate-400 text-sm mb-1">
                Description (optional)
              </label>
              <TextArea
                id="programDescription"
                {...register('description')}
                placeholder="Describe your program..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Sessions */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-white">Sessions</h2>
            <span className="text-slate-400 text-sm">
              {sessionFields.length} sessions/week
            </span>
          </div>

          {sessionFields.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-slate-400 mb-4">No sessions yet</p>
                <Button type="button" onClick={handleAddSession}>
                  <Plus size={18} className="mr-2" />
                  Add Session
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {sessionFields.map((sessionField, sessionIndex) => {
                const currentSession = watchedSessions[sessionIndex];
                
                return (
                  <Card key={sessionField.id}>
                    <CardContent className="p-4">
                      {/* Session Header */}
                      <div className="flex items-center gap-2 mb-3">
                        <GripVertical size={18} className="text-slate-500" />
                        <Input
                          {...register(`sessions.${sessionIndex}.name`)}
                          className="flex-1"
                          placeholder="Session name"
                        />
                        <select
                          {...register(`sessions.${sessionIndex}.dayOfWeek`)}
                          className="bg-slate-700 text-white rounded-lg px-3 py-2 text-sm"
                        >
                          {DAY_OPTIONS.map((opt) => (
                            <option key={opt.label} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleToggleExpand(sessionIndex)}
                          className="p-2 text-slate-400 hover:text-white"
                        >
                          {currentSession?.isExpanded ? (
                            <ChevronUp size={18} />
                          ) : (
                            <ChevronDown size={18} />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSession(sessionIndex)}
                          className="p-2 text-red-400 hover:text-red-300"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>

                      {/* Exercises */}
                      {currentSession?.isExpanded && (
                        <div className="space-y-2 ml-6">
                          {currentSession.exercises.length === 0 ? (
                            <p className="text-slate-500 text-sm py-2">
                              No exercises added
                            </p>
                          ) : (
                            currentSession.exercises.map((exercise, exerciseIndex) => (
                              <div
                                key={exercise.id ?? `${sessionField.id}-ex-${exerciseIndex}`}
                                className="flex items-center gap-2 p-2 bg-slate-700/50 rounded-lg"
                              >
                                <GripVertical
                                  size={16}
                                  className="text-slate-500"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-white text-sm truncate">
                                    {exercise.exerciseName}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    {...register(`sessions.${sessionIndex}.exercises.${exerciseIndex}.targetSets`, { valueAsNumber: true })}
                                    className="w-12 text-center p-1 h-8 text-sm"
                                    min={1}
                                  />
                                  <span className="text-slate-400 text-sm">×</span>
                                  <Input
                                    type="number"
                                    {...register(`sessions.${sessionIndex}.exercises.${exerciseIndex}.targetRepMin`, { valueAsNumber: true })}
                                    className="w-12 text-center p-1 h-8 text-sm"
                                    min={1}
                                  />
                                  <span className="text-slate-400 text-sm">-</span>
                                  <Input
                                    type="number"
                                    {...register(`sessions.${sessionIndex}.exercises.${exerciseIndex}.targetRepMax`, { valueAsNumber: true })}
                                    className="w-12 text-center p-1 h-8 text-sm"
                                    min={1}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteExercise(
                                      sessionIndex,
                                      exerciseIndex,
                                    )
                                  }
                                  className="p-1 text-red-400 hover:text-red-300"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            ))
                          )}

                          <button
                            type="button"
                            onClick={() => setShowAddExercise(sessionIndex)}
                            className="w-full p-2 border border-dashed border-slate-600 rounded-lg text-slate-400 hover:text-white hover:border-slate-500 flex items-center justify-center gap-2"
                          >
                            <Plus size={16} />
                            Add Exercise
                          </button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}

              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={handleAddSession}
              >
                <Plus size={18} className="mr-2" />
                Add Session
              </Button>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="fixed bottom-20 left-0 right-0 p-4 bg-gradient-to-t from-slate-900 to-transparent">
          <Button
            type="submit"
            className="w-full max-w-lg mx-auto block"
            disabled={loading}
          >
            <Save size={18} className="mr-2" />
            {isEditing ? 'Save Changes' : 'Create Program'}
          </Button>
        </div>
      </form>

      {/* Add Exercise Modal */}
      <Modal
        isOpen={showAddExercise !== null}
        onClose={() => {
          setShowAddExercise(null);
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
                onClick={() =>
                  showAddExercise !== null &&
                  handleAddExercise(showAddExercise, exercise)
                }
                className="w-full p-3 bg-slate-700 rounded-lg text-left hover:bg-slate-600 transition-colors"
              >
                <p className="text-white font-medium">{exercise.name}</p>
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

      {/* Discard Changes Modal */}
      <Modal
        isOpen={showDiscardModal}
        onClose={() => setShowDiscardModal(false)}
        title="Discard Changes?"
      >
        <p className="text-slate-300 mb-6">
          You have unsaved changes. Are you sure you want to discard them?
        </p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setShowDiscardModal(false)}
          >
            Keep Editing
          </Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700"
            onClick={() => navigate('/workout')}
          >
            Discard
          </Button>
        </div>
      </Modal>
    </div>
  );
}
