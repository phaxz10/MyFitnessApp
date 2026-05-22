import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Clock,
  Dumbbell,
  GripVertical,
  Link,
  Plus,
  Save,
  Sparkles,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import {
  Button,
  Card,
  CardContent,
  Input,
  Modal,
  Select,
  TextArea,
} from '../components/ui';
import {
  ALL_EQUIPMENT,
  EQUIPMENT_CATEGORIES,
  EXPERIENCE_LEVELS,
  MUSCLE_GROUPS,
  TRAINING_SPLITS,
} from '../constants/equipment';
import { useExercises } from '../hooks/useExercises';
import { useProfile } from '../hooks/useProfile';
import { useWorkoutPrograms } from '../hooks/useWorkoutPrograms';
import { getAICapability } from '../services/ai/useAICapability';
import { optimizeWorkoutProgram } from '../services/coaching/programCoach';
import type {
  AIProgramOptimizationInput,
  EquipmentType,
  Exercise,
  ExerciseType,
  ExperienceLevel,
} from '../types';
import { calculateAgeFromBirthdate } from '../utils/date';

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

const EXERCISE_TYPE_LABELS: Record<
  ExerciseType,
  { label: string; icon: typeof Dumbbell }
> = {
  reps_weight: { label: 'Reps & Weight', icon: Dumbbell },
  reps_only: { label: 'Reps Only', icon: Dumbbell },
  duration: { label: 'Duration', icon: Timer },
  duration_weight: { label: 'Duration & Weight', icon: Timer },
};

// Form schema with nested arrays
const programExerciseFormSchema = z.object({
  id: z.number().optional(),
  exerciseId: z.number(),
  exerciseName: z.string(),
  exerciseType: z.enum([
    'reps_weight',
    'reps_only',
    'duration',
    'duration_weight',
  ]),
  targetSets: z.number().min(1, 'At least 1 set required'),
  targetRepMin: z.number().nullable(),
  targetRepMax: z.number().nullable(),
  targetDurationSeconds: z.number().nullable(),
  supersetGroupId: z.string().nullable(),
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

// Generate unique superset group ID
function generateSupersetId(): string {
  return `ss-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

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
  const { profile } = useProfile();

  const [showAddExercise, setShowAddExercise] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [selectedForSuperset, setSelectedForSuperset] = useState<{
    sessionIndex: number;
    exerciseIndex: number;
  } | null>(null);
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);
  const [experienceLevel, setExperienceLevel] =
    useState<ExperienceLevel>('intermediate');
  const [preferredSplit, setPreferredSplit] =
    useState<
      AIProgramOptimizationInput['preferences']['preferredTrainingSplit']
    >('auto');
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(60);
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [injuries, setInjuries] = useState('');
  const [availableEquipment, setAvailableEquipment] =
    useState<EquipmentType[]>(ALL_EQUIPMENT);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
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

  const loadProgram = useCallback(
    async (programId: number) => {
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
      const isDuration =
        exercise.exercise_type === 'duration' ||
        exercise.exercise_type === 'duration_weight';

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
    setSearchQuery('');
  };

  const handleDeleteExercise = (
    sessionIndex: number,
    exerciseIndex: number,
  ) => {
    const currentSession = watchedSessions[sessionIndex];
    if (currentSession) {
      const updatedExercises = currentSession.exercises.filter(
        (_, i) => i !== exerciseIndex,
      );

      // Properly update the form field to unregister deleted exercise
      setValue(`sessions.${sessionIndex}.exercises`, updatedExercises, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
    // Clear superset selection if deleted exercise was selected
    if (
      selectedForSuperset?.sessionIndex === sessionIndex &&
      selectedForSuperset?.exerciseIndex === exerciseIndex
    ) {
      setSelectedForSuperset(null);
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
      // Second exercise selected in same session (and NOT the same exercise) - create superset
      const currentSession = watchedSessions[sessionIndex];
      if (currentSession) {
        const supersetId = generateSupersetId();
        const updatedExercises = [...currentSession.exercises];

        // Use the first exercise's targetSets for both exercises in the superset
        const sharedTargetSets =
          updatedExercises[selectedForSuperset.exerciseIndex].targetSets;

        updatedExercises[selectedForSuperset.exerciseIndex] = {
          ...updatedExercises[selectedForSuperset.exerciseIndex],
          supersetGroupId: supersetId,
        };
        updatedExercises[exerciseIndex] = {
          ...updatedExercises[exerciseIndex],
          supersetGroupId: supersetId,
          targetSets: sharedTargetSets, // Sync target sets
        };
        updateSessionField(sessionIndex, {
          ...currentSession,
          exercises: updatedExercises,
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

  // Group exercises by superset for visual display
  const getExerciseGroups = (exercises: ExerciseFormData[]) => {
    const groups: {
      supersetId: string | null;
      exercises: { exercise: ExerciseFormData; index: number }[];
    }[] = [];
    const processedIndices = new Set<number>();

    exercises.forEach((exercise, index) => {
      if (processedIndices.has(index)) return;

      if (exercise.supersetGroupId) {
        // Find all exercises in this superset
        const supersetExercises = exercises
          .map((ex, i) => ({ exercise: ex, index: i }))
          .filter(
            (item) =>
              item.exercise.supersetGroupId === exercise.supersetGroupId,
          );

        for (const item of supersetExercises) {
          processedIndices.add(item.index);
        }
        groups.push({
          supersetId: exercise.supersetGroupId,
          exercises: supersetExercises,
        });
      } else {
        processedIndices.add(index);
        groups.push({ supersetId: null, exercises: [{ exercise, index }] });
      }
    });

    return groups;
  };

  const onSubmit = async (data: ProgramFormData) => {
    if (data.sessions.length === 0) {
      alert('Please add at least one session');
      return;
    }

    try {
      let programId: number;

      if (isEditing) {
        programId = parseInt(id, 10);
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
          const dayOfWeek =
            session.dayOfWeek === '' ? null : parseInt(session.dayOfWeek, 10);

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
                  target_rep_min: exercise.targetRepMin ?? null,
                  target_rep_max: exercise.targetRepMax ?? null,
                  target_duration_seconds:
                    exercise.targetDurationSeconds ?? null,
                  superset_group_id: exercise.supersetGroupId ?? null,
                  order_index: j,
                  notes: exercise.notes || null,
                });
              } else {
                await addProgramExercise(sessionId, {
                  exercise_id: exercise.exerciseId,
                  target_sets: exercise.targetSets,
                  target_rep_min: exercise.targetRepMin ?? null,
                  target_rep_max: exercise.targetRepMax ?? null,
                  target_duration_seconds:
                    exercise.targetDurationSeconds ?? null,
                  superset_group_id: exercise.supersetGroupId ?? null,
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
                target_rep_min: exercise.targetRepMin ?? null,
                target_rep_max: exercise.targetRepMax ?? null,
                target_duration_seconds: exercise.targetDurationSeconds ?? null,
                superset_group_id: exercise.supersetGroupId ?? null,
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
          const dayOfWeek =
            session.dayOfWeek === '' ? null : parseInt(session.dayOfWeek, 10);
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
              target_rep_min: exercise.targetRepMin ?? null,
              target_rep_max: exercise.targetRepMax ?? null,
              target_duration_seconds: exercise.targetDurationSeconds ?? null,
              superset_group_id: exercise.supersetGroupId ?? null,
              order_index: j,
              notes: exercise.notes || null,
            });
          }
        }
      }

      navigate('/workout');
    } catch (err) {
      console.error('Failed to save program:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Check for database schema issue
      if (
        errorMessage.includes('not-null constraint') ||
        errorMessage.includes('target_rep_min')
      ) {
        alert(
          'Database schema needs updating. Please:\n' +
            '1. Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)\n' +
            '2. If that doesn\'t work, go to Settings and use "Reset Database"\n' +
            '\nNote: Reset Database will clear all your data.',
        );
      } else {
        alert(`Failed to save program: ${errorMessage}`);
      }
    }
  };

  // Handle AI optimization
  const handleOptimize = async () => {
    if (!profile) {
      setOptimizeError('Please set up your profile first in Settings.');
      return;
    }

    // Capability check: aiClient reads the key from store on each call.
    if (!getAICapability().available) {
      setOptimizeError(
        'Please add your OpenAI API key in Settings to use AI features.',
      );
      return;
    }

    setIsOptimizing(true);
    setOptimizeError(null);

    try {
      // Build the current program data from the form
      const currentFormData = watchedSessions;
      const programName =
        document.querySelector<HTMLInputElement>('#programName')?.value ||
        'My Program';
      const programDescription =
        document.querySelector<HTMLTextAreaElement>('#programDescription')
          ?.value || '';

      // Build weekly volume summary from current exercises
      const muscleGroupBreakdown: Record<string, number> = {};
      let totalSets = 0;

      for (const session of currentFormData) {
        for (const exercise of session.exercises) {
          totalSets += exercise.targetSets;
          // Find the exercise in the library to get muscle groups
          const libraryExercise = allExercises.find(
            (e) => e.id === exercise.exerciseId,
          );
          if (libraryExercise?.muscle_groups) {
            const muscles = libraryExercise.muscle_groups
              .split(',')
              .map((m) => m.trim());
            for (const muscle of muscles) {
              muscleGroupBreakdown[muscle] =
                (muscleGroupBreakdown[muscle] || 0) + exercise.targetSets;
            }
          }
        }
      }

      // Build the optimization input
      const optimizationInput: AIProgramOptimizationInput = {
        profile: {
          age: profile.birthdate
            ? calculateAgeFromBirthdate(profile.birthdate)
            : 30,
          gender: profile.gender,
          goal: profile.goal,
          activity_level: profile.activity_level,
          calorie_target: profile.calorie_target,
          protein_target_g: profile.protein_target_g,
          carbs_target_g: profile.carbs_target_g,
          fat_target_g: profile.fat_target_g,
        },
        program: {
          name: programName,
          description: programDescription,
          sessionsPerWeek: currentFormData.length,
          sessions: currentFormData.map((session) => ({
            name: session.name,
            dayOfWeek: session.dayOfWeek
              ? parseInt(session.dayOfWeek, 10)
              : null,
            exercises: session.exercises.map((exercise) => {
              const libraryExercise = allExercises.find(
                (e) => e.id === exercise.exerciseId,
              );
              return {
                name: exercise.exerciseName,
                muscle_groups: libraryExercise?.muscle_groups || '',
                equipment: libraryExercise?.equipment || '',
                exercise_type: exercise.exerciseType,
                targetSets: exercise.targetSets,
                targetRepMin: exercise.targetRepMin,
                targetRepMax: exercise.targetRepMax,
                targetDurationSeconds: exercise.targetDurationSeconds,
                notes: exercise.notes || null,
                supersetGroupId: exercise.supersetGroupId,
              };
            }),
          })),
        },
        exerciseLibrary: allExercises.map((e) => ({
          name: e.name,
          muscle_groups: e.muscle_groups,
          equipment: e.equipment,
          exercise_type: e.exercise_type,
        })),
        performanceSummary: [], // Could be populated from workout logs if needed
        weeklyVolumeSummary: {
          totalSets,
          muscleGroupBreakdown,
        },
        preferences: {
          injuries: injuries || null,
          focusAreas,
          experienceLevel,
          preferredTrainingSplit: preferredSplit,
          availableEquipment,
          sessionDurationMinutes,
        },
      };

      // Call the OpenAI optimization
      const result = await optimizeWorkoutProgram(optimizationInput);

      // Generate superset group IDs for paired exercises
      const generateSupersetIdForPair = () =>
        `ss-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Apply the optimized program to the form
      const newSessions = result.sessions.map((session) => {
        // Track superset pairs by name
        const supersetPairs: Record<string, string> = {};

        // First pass: identify superset pairs and generate IDs
        for (const exercise of session.exercises) {
          if (exercise.supersetWith) {
            const key = [exercise.name, exercise.supersetWith].sort().join('|');
            if (!supersetPairs[key]) {
              supersetPairs[key] = generateSupersetIdForPair();
            }
          }
        }

        return {
          name: session.name,
          dayOfWeek: session.dayOfWeek?.toString() ?? '',
          isExpanded: true,
          exercises: session.exercises.map((exercise) => {
            // Find the exercise in library to get ID and type
            const libraryExercise = allExercises.find(
              (e) => e.name.toLowerCase() === exercise.name.toLowerCase(),
            );

            // Determine superset group ID
            let supersetGroupId: string | null = null;
            if (exercise.supersetWith) {
              const key = [exercise.name, exercise.supersetWith]
                .sort()
                .join('|');
              supersetGroupId = supersetPairs[key] || null;
            }

            const exerciseType =
              libraryExercise?.exercise_type || 'reps_weight';
            const isDuration =
              exerciseType === 'duration' || exerciseType === 'duration_weight';

            return {
              exerciseId: libraryExercise?.id || 0,
              exerciseName: libraryExercise?.name || exercise.name,
              exerciseType,
              targetSets: exercise.targetSets,
              targetRepMin: isDuration ? null : exercise.targetRepMin,
              targetRepMax: isDuration ? null : exercise.targetRepMax,
              targetDurationSeconds: isDuration
                ? exercise.targetDurationSeconds || 30
                : null,
              supersetGroupId,
              notes: exercise.notes || '',
            };
          }),
        };
      });

      // Reset the form with new sessions
      reset({
        name: result.programName,
        description: result.programDescription,
        sessions: newSessions,
      });

      setShowOptimizeModal(false);

      // Show recommendations in an alert
      if (result.recommendations && result.recommendations.length > 0) {
        setTimeout(() => {
          alert(
            'Optimization complete!\n\nRecommendations:\n- ' +
              result.recommendations.join('\n- '),
          );
        }, 100);
      }
    } catch (error) {
      console.error('Optimization failed:', error);
      setOptimizeError(
        error instanceof Error
          ? error.message
          : 'Failed to optimize program. Please try again.',
      );
    } finally {
      setIsOptimizing(false);
    }
  };

  const filteredExercises = allExercises.filter(
    (ex) =>
      ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ex.muscle_groups?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const renderExerciseCard = (
    exercise: ExerciseFormData,
    exerciseIndex: number,
    sessionIndex: number,
    sessionFieldId: string,
    isInSuperset: boolean = false,
  ) => {
    const isDuration =
      exercise.exerciseType === 'duration' ||
      exercise.exerciseType === 'duration_weight';
    const hasWeight =
      exercise.exerciseType === 'reps_weight' ||
      exercise.exerciseType === 'duration_weight';
    const isSelectedForSuperset =
      selectedForSuperset?.sessionIndex === sessionIndex &&
      selectedForSuperset?.exerciseIndex === exerciseIndex;
    const TypeIcon =
      EXERCISE_TYPE_LABELS[exercise.exerciseType]?.icon || Dumbbell;

    return (
      <div
        key={exercise.id ?? `${sessionFieldId}-ex-${exerciseIndex}`}
        className={`p-3 rounded-lg transition-all ${
          isSelectedForSuperset
            ? 'bg-blue-600/20 border-2 border-blue-500'
            : 'bg-slate-700/50 border border-transparent'
        }`}
      >
        {/* Exercise Header - Always visible */}
        <div className="flex items-center gap-2 mb-2">
          <GripVertical size={16} className="text-slate-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-white font-medium truncate">
                {exercise.exerciseName}
              </p>
              <TypeIcon size={14} className="text-slate-400 flex-shrink-0" />
            </div>
            <p className="text-slate-400 text-xs">
              {EXERCISE_TYPE_LABELS[exercise.exerciseType]?.label}
            </p>
          </div>

          {/* Superset Button - only show when NOT in superset */}
          {!isInSuperset && (
            <button
              type="button"
              onClick={() => handleCreateSuperset(sessionIndex, exerciseIndex)}
              className={`p-1.5 rounded transition-colors ${
                isSelectedForSuperset
                  ? 'bg-blue-500 text-white'
                  : 'text-slate-400 hover:text-blue-400 hover:bg-slate-600'
              }`}
              title={
                isSelectedForSuperset
                  ? 'Click another exercise to link'
                  : 'Create superset'
              }
            >
              <Link size={14} />
            </button>
          )}

          {/* Delete button - always visible */}
          <button
            type="button"
            onClick={() => handleDeleteExercise(sessionIndex, exerciseIndex)}
            className="p-1.5 text-red-400 hover:text-red-300 hover:bg-slate-600 rounded transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* Exercise Configuration */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sets - only show when NOT in superset (superset has shared sets) */}
          {!isInSuperset && (
            <div className="flex items-center gap-1">
              <span className="text-slate-400 text-xs">Sets:</span>
              <Input
                type="number"
                {...register(
                  `sessions.${sessionIndex}.exercises.${exerciseIndex}.targetSets`,
                  { valueAsNumber: true },
                )}
                className="w-14 text-center p-1 h-7 text-sm"
                min={1}
              />
            </div>
          )}

          {/* Reps (for non-duration exercises) */}
          {!isDuration && (
            <div className="flex items-center gap-1">
              <span className="text-slate-400 text-xs">Reps:</span>
              <Input
                type="number"
                {...register(
                  `sessions.${sessionIndex}.exercises.${exerciseIndex}.targetRepMin`,
                  { valueAsNumber: true },
                )}
                className="w-12 text-center p-1 h-7 text-sm"
                min={1}
              />
              <span className="text-slate-400 text-xs">-</span>
              <Input
                type="number"
                {...register(
                  `sessions.${sessionIndex}.exercises.${exerciseIndex}.targetRepMax`,
                  { valueAsNumber: true },
                )}
                className="w-12 text-center p-1 h-7 text-sm"
                min={1}
              />
            </div>
          )}

          {/* Duration (for duration exercises) */}
          {isDuration && (
            <div className="flex items-center gap-1">
              <Clock size={14} className="text-slate-400" />
              <Input
                type="number"
                {...register(
                  `sessions.${sessionIndex}.exercises.${exerciseIndex}.targetDurationSeconds`,
                  { valueAsNumber: true },
                )}
                className="w-16 text-center p-1 h-7 text-sm"
                min={1}
                placeholder="sec"
              />
              <span className="text-slate-400 text-xs">sec</span>
            </div>
          )}

          {/* Weight indicator for weight-based exercises */}
          {hasWeight && (
            <div className="flex items-center gap-1 text-slate-400 text-xs">
              <Dumbbell size={12} />
              <span>+ weight</span>
            </div>
          )}
        </div>
      </div>
    );
  };

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
        <h1 className="text-xl font-bold text-white flex-1">
          {isEditing ? 'Edit Program' : 'New Program'}
        </h1>
        {/* AI Optimize Button - only show when there are sessions */}
        {sessionFields.length > 0 && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowOptimizeModal(true)}
            className="flex items-center gap-2"
            disabled={isOptimizing}
          >
            <Sparkles size={16} />
            <span className="hidden sm:inline">Optimize</span>
          </Button>
        )}
      </div>

      {/* Superset Selection Hint */}
      {selectedForSuperset !== null && (
        <div className="mb-4 p-3 bg-blue-600/20 border border-blue-500 rounded-lg">
          <p className="text-blue-300 text-sm">
            Click another exercise in this session to create a superset, or
            click the same exercise to cancel.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Program Info */}
        <Card className="mb-4">
          <CardContent className="p-4 space-y-4">
            <div>
              <label
                htmlFor="programName"
                className="block text-slate-400 text-sm mb-1"
              >
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
              <label
                htmlFor="programDescription"
                className="block text-slate-400 text-sm mb-1"
              >
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
                const exerciseGroups = currentSession
                  ? getExerciseGroups(currentSession.exercises)
                  : [];

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
                          {exerciseGroups.length === 0 ? (
                            <p className="text-slate-500 text-sm py-2">
                              No exercises added
                            </p>
                          ) : (
                            exerciseGroups.map((group) =>
                              group.supersetId ? (
                                // Superset group
                                <div
                                  key={group.supersetId}
                                  className="border-l-4 border-purple-500 pl-3 space-y-2"
                                >
                                  {/* Superset Header with break button and shared sets */}
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                      <Link
                                        size={14}
                                        className="text-purple-400"
                                      />
                                      <span className="text-purple-400 text-xs font-medium uppercase">
                                        Superset
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {/* Shared Sets field for superset */}
                                      <div className="flex items-center gap-1">
                                        <span className="text-slate-400 text-xs">
                                          Sets:
                                        </span>
                                        <Input
                                          type="number"
                                          value={
                                            group.exercises[0]?.exercise
                                              .targetSets || 3
                                          }
                                          onChange={(e) => {
                                            const newSets =
                                              parseInt(e.target.value) || 1;
                                            handleUpdateSupersetSets(
                                              sessionIndex,
                                              group.supersetId!,
                                              newSets,
                                            );
                                          }}
                                          className="w-14 text-center p-1 h-7 text-sm"
                                          min={1}
                                        />
                                      </div>
                                      {/* Break superset button */}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleBreakSuperset(
                                            sessionIndex,
                                            group.supersetId!,
                                          )
                                        }
                                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-600 rounded transition-colors"
                                        title="Break superset"
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  </div>
                                  {group.exercises.map(({ exercise, index }) =>
                                    renderExerciseCard(
                                      exercise,
                                      index,
                                      sessionIndex,
                                      sessionField.id,
                                      true,
                                    ),
                                  )}
                                </div>
                              ) : (
                                // Single exercise
                                group.exercises.map(({ exercise, index }) =>
                                  renderExerciseCard(
                                    exercise,
                                    index,
                                    sessionIndex,
                                    sessionField.id,
                                    false,
                                  ),
                                )
                              ),
                            )
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
        <div className="mt-6 mb-24 max-w-lg mx-auto">
          <Button type="submit" className="w-full" disabled={loading}>
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
            filteredExercises.map((exercise) => {
              const TypeIcon =
                EXERCISE_TYPE_LABELS[exercise.exercise_type || 'reps_weight']
                  ?.icon || Dumbbell;
              return (
                <button
                  type="button"
                  key={exercise.id}
                  onClick={() =>
                    showAddExercise !== null &&
                    handleAddExercise(showAddExercise, exercise)
                  }
                  className="w-full p-3 bg-slate-700 rounded-lg text-left hover:bg-slate-600 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <p className="text-white font-medium flex-1">
                      {exercise.name}
                    </p>
                    <TypeIcon size={16} className="text-slate-400" />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {exercise.muscle_groups && (
                      <p className="text-slate-400 text-sm">
                        {exercise.muscle_groups}
                      </p>
                    )}
                    <span className="text-slate-500 text-xs">
                      {
                        EXERCISE_TYPE_LABELS[
                          exercise.exercise_type || 'reps_weight'
                        ]?.label
                      }
                    </span>
                  </div>
                </button>
              );
            })
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

      {/* AI Optimize Modal */}
      <Modal
        isOpen={showOptimizeModal}
        onClose={() => {
          if (!isOptimizing) {
            setShowOptimizeModal(false);
            setOptimizeError(null);
          }
        }}
        title="Optimize with AI"
      >
        <div className="space-y-4">
          <p className="text-slate-300 text-sm">
            AI will analyze your program and suggest improvements based on your
            preferences, exercise selection, and training principles.
          </p>

          {/* Experience Level */}
          <div>
            <label
              htmlFor="optimize-experience"
              className="block text-slate-400 text-sm mb-1"
            >
              Experience Level
            </label>
            <Select
              id="optimize-experience"
              value={experienceLevel}
              onChange={(e) =>
                setExperienceLevel(e.target.value as ExperienceLevel)
              }
              options={Object.entries(EXPERIENCE_LEVELS).map(([key, val]) => ({
                value: key,
                label: `${val.label} - ${val.description}`,
              }))}
            />
          </div>

          {/* Preferred Split */}
          <div>
            <label
              htmlFor="optimize-split"
              className="block text-slate-400 text-sm mb-1"
            >
              Preferred Training Split
            </label>
            <Select
              id="optimize-split"
              value={preferredSplit ?? 'auto'}
              onChange={(e) =>
                setPreferredSplit(
                  e.target
                    .value as AIProgramOptimizationInput['preferences']['preferredTrainingSplit'],
                )
              }
              options={Object.entries(TRAINING_SPLITS).map(([key, val]) => ({
                value: key,
                label: `${val.label} - ${val.description}`,
              }))}
            />
          </div>

          {/* Session Duration */}
          <div>
            <label
              htmlFor="optimize-duration"
              className="block text-slate-400 text-sm mb-1"
            >
              Session Duration (minutes)
            </label>
            <Input
              id="optimize-duration"
              type="number"
              value={sessionDurationMinutes}
              onChange={(e) =>
                setSessionDurationMinutes(parseInt(e.target.value) || 60)
              }
              min={20}
              max={180}
            />
          </div>

          {/* Focus Areas */}
          <div>
            <span className="block text-slate-400 text-sm mb-1">
              Focus Areas (optional)
            </span>
            <div className="flex flex-wrap gap-2">
              {MUSCLE_GROUPS.map((muscle) => (
                <button
                  key={muscle}
                  type="button"
                  onClick={() => {
                    setFocusAreas((prev) =>
                      prev.includes(muscle)
                        ? prev.filter((m) => m !== muscle)
                        : [...prev, muscle],
                    );
                  }}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    focusAreas.includes(muscle)
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {muscle}
                </button>
              ))}
            </div>
          </div>

          {/* Injuries */}
          <div>
            <label
              htmlFor="optimize-injuries"
              className="block text-slate-400 text-sm mb-1"
            >
              Injuries / Limitations (optional)
            </label>
            <TextArea
              id="optimize-injuries"
              value={injuries}
              onChange={(e) => setInjuries(e.target.value)}
              placeholder="e.g., Bad lower back, shoulder impingement..."
              rows={2}
            />
          </div>

          {/* Equipment */}
          <div>
            <span className="block text-slate-400 text-sm mb-1">
              Available Equipment
            </span>
            <div className="max-h-40 overflow-y-auto space-y-2">
              {Object.entries(EQUIPMENT_CATEGORIES).map(
                ([categoryKey, category]) => (
                  <div key={categoryKey}>
                    <p className="text-xs text-slate-500 mb-1">
                      {category.label}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {category.items.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => {
                            setAvailableEquipment((prev) =>
                              prev.includes(item)
                                ? prev.filter((e) => e !== item)
                                : [...prev, item],
                            );
                          }}
                          className={`px-2 py-0.5 rounded text-xs transition-colors ${
                            availableEquipment.includes(item)
                              ? 'bg-green-600 text-white'
                              : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>

          {/* Error display */}
          {optimizeError && (
            <div className="p-3 bg-red-600/20 border border-red-500 rounded-lg">
              <p className="text-red-300 text-sm">{optimizeError}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setShowOptimizeModal(false);
                setOptimizeError(null);
              }}
              disabled={isOptimizing}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 flex items-center justify-center gap-2"
              onClick={handleOptimize}
              disabled={isOptimizing || !profile}
            >
              {isOptimizing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Optimizing...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Optimize Program
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
