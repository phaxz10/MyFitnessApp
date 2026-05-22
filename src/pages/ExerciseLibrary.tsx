import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Edit,
  ListPlus,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  Card,
  CardContent,
  Input,
  Modal,
  TextArea,
} from '../components/ui';
import { useExercises } from '../hooks/useExercises';
import { type ExerciseFormData, exerciseFormSchema } from '../schemas/forms';
import {
  findDuplicateExercises,
  generateExerciseDetails,
  generateExerciseDetailsBatch,
  isOpenAIInitialized,
} from '../services/openai';
import type { AIExerciseResponse, Exercise, ExerciseType } from '../types';

const MUSCLE_GROUPS = [
  'All',
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Legs',
  'Core',
  'Glutes',
  'Full Body',
];
const EXERCISE_TYPES: {
  value: ExerciseType;
  label: string;
  description: string;
}[] = [
  {
    value: 'reps_weight',
    label: 'Reps & Weight',
    description: 'e.g., Bench Press, Squat',
  },
  {
    value: 'reps_only',
    label: 'Reps Only',
    description: 'e.g., Pull-ups, Push-ups',
  },
  {
    value: 'duration',
    label: 'Duration',
    description: 'e.g., Plank, Dead Hang',
  },
  {
    value: 'duration_weight',
    label: 'Duration & Weight',
    description: 'e.g., Weighted Plank',
  },
];
// Generate YouTube search URL for exercise demo
function getYouTubeSearchUrl(exerciseName: string): string {
  const query = encodeURIComponent(`${exerciseName} exercise form tutorial`);
  return `https://www.youtube.com/results?search_query=${query}`;
}
export function ExerciseLibrary() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    exercises,
    fetchExercises,
    addExercise,
    addExercisesBatch,
    updateExercise,
    deleteExercise,
    loading,
  } = useExercises();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState<Exercise | null>(
    null,
  );
  const [showDeleteModal, setShowDeleteModal] = useState<Exercise | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  // Batch add state
  const [batchInput, setBatchInput] = useState('');
  const [batchExercises, setBatchExercises] = useState<
    {
      name: string;
      status: 'pending' | 'generating' | 'ready' | 'error';
      details?: AIExerciseResponse;
      duplicates?: Exercise[];
      includeForGeneration: boolean;
    }[]
  >([]);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);

  // Regenerate all exercises state
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateProgress, setRegenerateProgress] = useState<{
    current: number;
    total: number;
    currentExercise: string;
    errors: string[];
    completed: string[];
  } | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ExerciseFormData>({
    resolver: zodResolver(exerciseFormSchema),
    defaultValues: {
      name: '',
      description: '',
      muscleGroups: '',
      equipment: '',
      exerciseType: 'reps_weight',
    },
  });
  const formName = watch('name') ?? '';
  const formExerciseType = watch('exerciseType');

  // Regenerate all exercises - updates descriptions using current AI prompts
  const handleRegenerateAllExercises = useCallback(async () => {
    if (!isOpenAIInitialized()) {
      alert('Please set up your OpenAI API key in Settings');
      return;
    }

    if (exercises.length === 0) {
      alert('No exercises to regenerate');
      return;
    }

    setIsRegenerating(true);
    setRegenerateProgress({
      current: 0,
      total: exercises.length,
      currentExercise: '',
      errors: [],
      completed: [],
    });

    const errors: string[] = [];
    const completed: string[] = [];

    // Process exercises in batches of 5 for efficiency
    const batchSize = 5;
    for (let i = 0; i < exercises.length; i += batchSize) {
      const batch = exercises.slice(i, i + batchSize);
      const batchNames = batch.map((ex) => ex.name);

      setRegenerateProgress((prev) =>
        prev
          ? {
              ...prev,
              current: i,
              currentExercise: `Processing batch: ${batchNames.join(', ')}`,
            }
          : null,
      );

      try {
        const details = await generateExerciseDetailsBatch(batchNames);

        // Update each exercise in the batch
        for (let j = 0; j < batch.length; j++) {
          const exercise = batch[j];
          const detail = details[j];

          if (detail) {
            const fullDescription = detail.tips?.length
              ? `${detail.description}\n\nTips:\n${detail.tips.map((tip) => `• ${tip}`).join('\n')}`
              : detail.description;

            try {
              await updateExercise(exercise.id, {
                name: detail.name,
                description: fullDescription,
                muscle_groups: detail.muscle_groups.join(', '),
                equipment: detail.equipment,
                exercise_type: detail.exercise_type,
              });
              completed.push(exercise.name);
            } catch (updateError) {
              console.error(`Failed to update ${exercise.name}:`, updateError);
              errors.push(`${exercise.name}: Failed to save`);
            }
          } else {
            errors.push(`${exercise.name}: No details generated`);
          }
        }

        setRegenerateProgress((prev) =>
          prev
            ? {
                ...prev,
                current: Math.min(i + batchSize, exercises.length),
                completed: [...completed],
                errors: [...errors],
              }
            : null,
        );
      } catch (batchError) {
        console.error(`Batch generation failed:`, batchError);
        for (const ex of batch) {
          errors.push(`${ex.name}: Batch generation failed`);
        }
      }

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < exercises.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    setRegenerateProgress((prev) =>
      prev
        ? {
            ...prev,
            current: exercises.length,
            currentExercise: 'Complete!',
            completed,
            errors,
          }
        : null,
    );

    setIsRegenerating(false);

    // Refresh the exercises list
    await fetchExercises();

    // Clear the URL param
    setSearchParams({});
  }, [exercises, updateExercise, fetchExercises, setSearchParams]);

  // Check for regenerate-details-all URL param
  useEffect(() => {
    if (
      searchParams.get('regenerate-details-all') === 'true' &&
      exercises.length > 0 &&
      !isRegenerating
    ) {
      setShowRegenerateModal(true);
    }
  }, [searchParams, exercises.length, isRegenerating]);

  useEffect(() => {
    fetchExercises();
  }, [fetchExercises]);
  const filteredExercises = exercises.filter((ex) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      ex.name.toLowerCase().includes(q) ||
      ex.muscle_groups?.toLowerCase().includes(q) ||
      ex.equipment?.toLowerCase().includes(q);
    const matchesMuscle =
      selectedMuscle === 'All' ||
      ex.muscle_groups?.toLowerCase().includes(selectedMuscle.toLowerCase());
    return matchesSearch && matchesMuscle;
  });
  const resetForm = () => {
    reset({
      name: '',
      description: '',
      muscleGroups: '',
      equipment: '',
      exerciseType: 'reps_weight',
    });
    setEditingExercise(null);
  };
  const handleOpenAddModal = (exercise?: Exercise) => {
    if (exercise) {
      setEditingExercise(exercise);
      reset({
        name: exercise.name,
        description: exercise.description || '',
        muscleGroups: exercise.muscle_groups || '',
        equipment: exercise.equipment || '',
        exerciseType: exercise.exercise_type || 'reps_weight',
      });
    } else {
      resetForm();
    }
    setShowAddModal(true);
  };
  const handleGenerateDetails = async () => {
    if (!formName.trim()) {
      alert('Please enter an exercise name first');
      return;
    }
    if (!isOpenAIInitialized()) {
      alert('Please set up your OpenAI API key in Settings');
      return;
    }
    // Single-generate duplicate check
    if (exercises.length > 0) {
      try {
        const duplicates = await findDuplicateExercises(formName, exercises);
        if (duplicates.length > 0) {
          const message = `This exercise looks similar to existing ones:\n\n${duplicates
            .map(
              (ex) =>
                `- ${ex.name} (${ex.muscle_groups}${
                  ex.equipment ? `, ${ex.equipment}` : ''
                })`,
            )
            .join('\n')}\n\nDo you still want to generate a new variation?`;
          const proceed = window.confirm(message);
          if (!proceed) {
            return;
          }
        }
      } catch (error) {
        console.error('Duplicate check failed for exercise', error);
      }
    }
    setIsGenerating(true);
    try {
      const details: AIExerciseResponse | AIExerciseResponse[] =
        await generateExerciseDetails(formName);

      const normalizedDetails = Array.isArray(details) ? details[0] : details;
      const safeDetails: AIExerciseResponse = {
        name: normalizedDetails?.name ?? formName,
        description: normalizedDetails?.description ?? '',
        muscle_groups: Array.isArray(normalizedDetails?.muscle_groups)
          ? normalizedDetails.muscle_groups
          : [],
        equipment: normalizedDetails?.equipment ?? '',
        exercise_type: normalizedDetails?.exercise_type ?? 'reps_weight',
        tips: Array.isArray(normalizedDetails?.tips)
          ? normalizedDetails.tips
          : [],
      };
      // Combine description with tips for comprehensive instructions
      const fullDescription = safeDetails.tips.length
        ? `${safeDetails.description}\n\nTips:\n${safeDetails.tips
            .map((tip) => `• ${tip}`)
            .join('\n')}`
        : safeDetails.description;
      setValue('name', safeDetails.name);
      setValue('description', fullDescription);
      setValue('muscleGroups', safeDetails.muscle_groups.join(', '));
      setValue('equipment', safeDetails.equipment);
      setValue('exerciseType', safeDetails.exercise_type);
    } catch (err) {
      console.error('Failed to generate exercise details:', err);
      alert('Failed to generate details. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };
  const onSubmit = async (data: ExerciseFormData) => {
    try {
      if (editingExercise) {
        await updateExercise(editingExercise.id, {
          name: data.name,
          description: data.description || '',
          muscle_groups: data.muscleGroups || '',
          equipment: data.equipment || '',
          exercise_type: data.exerciseType,
        });
      } else {
        await addExercise({
          name: data.name,
          description: data.description || '',
          muscle_groups: data.muscleGroups || '',
          equipment: data.equipment || '',
          exercise_type: data.exerciseType,
          video_url: null,
          is_ai_generated: false,
        });
      }
      setShowAddModal(false);
      resetForm();
    } catch (err) {
      console.error('Failed to save exercise:', err);
      alert('Failed to save exercise');
    }
  };
  const handleDeleteExercise = async () => {
    if (!showDeleteModal) return;
    try {
      await deleteExercise(showDeleteModal.id);
      setShowDeleteModal(null);
      setShowDetailsModal(null);
    } catch (err) {
      console.error('Failed to delete exercise:', err);
      alert('Failed to delete exercise. It may be used in a program.');
    }
  };
  // Batch add handlers
  const handleParseBatchInput = () => {
    const names = batchInput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (names.length === 0) {
      alert('Please enter at least one exercise name');
      return;
    }
    setBatchExercises(
      names.map((name) => ({
        name,
        status: 'pending',
        includeForGeneration: true,
      })),
    );
  };
  const handleRemoveBatchExercise = (index: number) => {
    setBatchExercises((prev) => prev.filter((_, i) => i !== index));
  };
  const handleGenerateBatchDetails = async () => {
    if (!isOpenAIInitialized()) {
      alert('Please set up your OpenAI API key in Settings');
      return;
    }
    const pendingExercises = batchExercises.filter(
      (ex) => ex.status === 'pending' && ex.includeForGeneration,
    );
    if (pendingExercises.length === 0) return;
    // Batch duplicate check – per row, no global confirm
    if (exercises.length > 0) {
      try {
        const duplicateMap: Record<string, Exercise[]> = {};
        for (const ex of pendingExercises) {
          const duplicates = await findDuplicateExercises(ex.name, exercises);
          if (duplicates.length > 0) {
            duplicateMap[ex.name] = duplicates;
          }
        }
        setBatchExercises((prev) =>
          prev.map((ex) => ({
            ...ex,
            duplicates: duplicateMap[ex.name],
          })),
        );
      } catch (error) {
        console.error('Duplicate check failed for batch exercises', error);
      }
    }
    setIsBatchGenerating(true);
    // Mark only included + pending items as generating
    setBatchExercises((prev) =>
      prev.map((ex) =>
        ex.status === 'pending' && ex.includeForGeneration
          ? { ...ex, status: 'generating' }
          : ex,
      ),
    );
    try {
      const names = pendingExercises.map((ex) => ex.name);
      const details = await generateExerciseDetailsBatch(names);
      // Update with generated details
      setBatchExercises((prev) => {
        const updated = [...prev];
        let detailIndex = 0;
        for (let i = 0; i < updated.length; i++) {
          if (updated[i].status === 'generating') {
            if (details[detailIndex]) {
              updated[i] = {
                ...updated[i],
                status: 'ready',
                details: details[detailIndex],
              };
            } else {
              updated[i] = { ...updated[i], status: 'error' };
            }
            detailIndex++;
          }
        }
        return updated;
      });
    } catch (err) {
      console.error('Failed to generate batch details:', err);
      setBatchExercises((prev) =>
        prev.map((ex) =>
          ex.status === 'generating' ? { ...ex, status: 'error' } : ex,
        ),
      );
    } finally {
      setIsBatchGenerating(false);
    }
  };
  const handleSaveBatchExercises = async () => {
    const readyExercises = batchExercises.filter((ex) => ex.status === 'ready');
    if (readyExercises.length === 0) {
      alert('No exercises ready to save. Generate details first.');
      return;
    }
    try {
      const exercisesToAdd = readyExercises.map((ex) => {
        const details = ex.details!;
        const fullDescription = details.tips?.length
          ? `${details.description}\n\nTips:\n${details.tips
              .map((tip) => `• ${tip}`)
              .join('\n')}`
          : details.description;
        return {
          name: details.name,
          description: fullDescription,
          muscle_groups: details.muscle_groups.join(', '),
          equipment: details.equipment,
          exercise_type: details.exercise_type,
          video_url: null,
          is_ai_generated: true,
        };
      });
      await addExercisesBatch(exercisesToAdd);
      setShowBatchModal(false);
      setBatchInput('');
      setBatchExercises([]);
    } catch (err) {
      console.error('Failed to save batch exercises:', err);
      alert('Failed to save exercises');
    }
  };
  const handleCloseBatchModal = () => {
    setShowBatchModal(false);
    setBatchInput('');
    setBatchExercises([]);
  };
  // Group exercises by muscle group for display
  const groupedExercises = filteredExercises.reduce(
    (acc, ex) => {
      const group = ex.muscle_groups?.split(',')[0]?.trim() || 'Other';
      if (!acc[group]) acc[group] = [];
      acc[group].push(ex);
      return acc;
    },
    {} as Record<string, Exercise[]>,
  );
  return (
    <div className="p-4 pb-24">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-white">Exercise Library</h1>
        <p className="text-slate-400 text-sm">
          Manage your exercise collection
        </p>
      </div>
      {/* Search */}
      <div className="relative mb-4">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <Input
          placeholder="Search exercises..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>
      {/* Muscle Group Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {MUSCLE_GROUPS.map((muscle) => (
          <button
            type="button"
            key={muscle}
            onClick={() => setSelectedMuscle(muscle)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
              selectedMuscle === muscle
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {muscle}
          </button>
        ))}
      </div>
      {/* Action Buttons */}
      <div className="flex gap-2 mb-4">
        <Button className="flex-1" onClick={() => handleOpenAddModal()}>
          <Plus size={18} className="mr-2" />
          Add Exercise
        </Button>
        <Button variant="secondary" onClick={() => setShowBatchModal(true)}>
          <ListPlus size={18} className="mr-2" />
          Batch Add
        </Button>
      </div>
      {/* Exercise List */}
      {filteredExercises.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-slate-400 mb-4">
              {searchQuery || selectedMuscle !== 'All'
                ? 'No exercises found matching your search'
                : 'No exercises in your library yet'}
            </p>
            {!searchQuery && selectedMuscle === 'All' && (
              <Button onClick={() => handleOpenAddModal()}>
                Add Your First Exercise
              </Button>
            )}
          </CardContent>
        </Card>
      ) : selectedMuscle === 'All' && !searchQuery ? (
        // Grouped view
        <div className="space-y-4">
          {Object.entries(groupedExercises).map(([group, exs]) => (
            <div key={group}>
              <h3 className="text-sm font-semibold text-slate-400 mb-2">
                {group}
              </h3>
              <div className="space-y-2">
                {exs.map((exercise) => (
                  <Card
                    key={exercise.id}
                    className="cursor-pointer hover:border-slate-600 transition-colors"
                    onClick={() => setShowDetailsModal(exercise)}
                  >
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium">
                          {exercise.name}
                        </p>
                        <p className="text-slate-400 text-sm truncate">
                          {exercise.equipment || 'No equipment'}
                        </p>
                      </div>
                      <ChevronRight size={18} className="text-slate-500" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Flat list view
        <div className="space-y-2">
          {filteredExercises.map((exercise) => (
            <Card
              key={exercise.id}
              className="cursor-pointer hover:border-slate-600 transition-colors"
              onClick={() => setShowDetailsModal(exercise)}
            >
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium">{exercise.name}</p>
                  <p className="text-slate-400 text-sm">
                    {exercise.muscle_groups || 'No muscle groups'} •{' '}
                    {exercise.equipment || 'No equipment'}
                  </p>
                </div>
                <ChevronRight size={18} className="text-slate-500" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {/* Add/Edit Exercise Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          resetForm();
        }}
        title={editingExercise ? 'Edit Exercise' : 'Add Exercise'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-slate-400 text-sm mb-1">
              Exercise Name *
            </label>
            <div className="flex gap-2">
              <Input
                id="name"
                {...register('name')}
                placeholder="e.g., Bench Press"
                className="flex-1"
                error={errors.name?.message}
              />
              {isOpenAIInitialized() && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleGenerateDetails}
                  disabled={isGenerating || !formName.trim()}
                  title="Generate details with AI"
                >
                  <Sparkles
                    size={18}
                    className={isGenerating ? 'animate-spin' : ''}
                  />
                </Button>
              )}
            </div>
          </div>
          <div>
            <label
              htmlFor="description"
              className="block text-slate-400 text-sm mb-1"
            >
              Description
            </label>
            <TextArea
              id="description"
              {...register('description')}
              placeholder="How to perform the exercise..."
              rows={3}
            />
          </div>
          <div>
            <label
              htmlFor="muscleGroups"
              className="block text-slate-400 text-sm mb-1"
            >
              Muscle Groups
            </label>
            <Input
              id="muscleGroups"
              {...register('muscleGroups')}
              placeholder="e.g., Chest, Shoulders, Triceps"
            />
          </div>
          <div>
            <label
              htmlFor="equipment"
              className="block text-slate-400 text-sm mb-1"
            >
              Equipment
            </label>
            <Input
              id="equipment"
              {...register('equipment')}
              placeholder="e.g., Barbell, Bench"
            />
          </div>
          <div>
            <p className="text-slate-400 text-sm mb-2">Exercise Type</p>
            <div className="grid grid-cols-2 gap-2">
              {EXERCISE_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setValue('exerciseType', type.value)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    formExerciseType === type.value
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-600 hover:border-slate-500'
                  }`}
                >
                  <p className="text-white text-sm font-medium">{type.label}</p>
                  <p className="text-slate-400 text-xs">{type.description}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setShowAddModal(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={loading || !formName.trim()}
            >
              {editingExercise ? 'Save Changes' : 'Add Exercise'}
            </Button>
          </div>
        </form>
      </Modal>
      {/* Exercise Details Modal */}
      <Modal
        isOpen={!!showDetailsModal}
        onClose={() => setShowDetailsModal(null)}
        title={showDetailsModal?.name || ''}
      >
        {showDetailsModal && (
          <div className="space-y-4">
            <div>
              <p className="text-slate-400 text-sm">Exercise Type</p>
              <p className="text-white">
                {EXERCISE_TYPES.find(
                  (t) =>
                    t.value ===
                    (showDetailsModal.exercise_type || 'reps_weight'),
                )?.label || 'Reps & Weight'}
              </p>
            </div>
            {showDetailsModal.muscle_groups && (
              <div>
                <p className="text-slate-400 text-sm">Muscle Groups</p>
                <p className="text-white">{showDetailsModal.muscle_groups}</p>
              </div>
            )}
            {showDetailsModal.equipment && (
              <div>
                <p className="text-slate-400 text-sm">Equipment</p>
                <p className="text-white">{showDetailsModal.equipment}</p>
              </div>
            )}
            {showDetailsModal.description && (
              <div>
                <p className="text-slate-400 text-sm">Instructions</p>
                <p className="text-white whitespace-pre-wrap">
                  {showDetailsModal.description}
                </p>
              </div>
            )}
            {/* Video Demo Link */}
            <a
              href={getYouTubeSearchUrl(showDetailsModal.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors"
            >
              <Video size={18} />
              <span>Watch Demo on YouTube</span>
            </a>
            {showDetailsModal.is_ai_generated && (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Sparkles size={14} />
                <span>AI Generated</span>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  handleOpenAddModal(showDetailsModal);
                  setShowDetailsModal(null);
                }}
              >
                <Edit size={18} className="mr-2" />
                Edit
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700"
                onClick={() => setShowDeleteModal(showDetailsModal)}
              >
                <Trash2 size={18} className="mr-2" />
                Delete
              </Button>
            </div>
          </div>
        )}
      </Modal>
      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!showDeleteModal}
        onClose={() => setShowDeleteModal(null)}
        title="Delete Exercise"
      >
        <p className="text-slate-300 mb-6">
          Are you sure you want to delete "{showDeleteModal?.name}"? This may
          affect programs that use this exercise.
        </p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setShowDeleteModal(null)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700"
            onClick={handleDeleteExercise}
          >
            Delete
          </Button>
        </div>
      </Modal>
      {/* Batch Add Modal */}
      <Modal
        isOpen={showBatchModal}
        onClose={handleCloseBatchModal}
        title="Batch Add Exercises"
      >
        <div className="space-y-4">
          {batchExercises.length === 0 ? (
            <>
              <p className="text-slate-400 text-sm">
                Enter exercise names (one per line). AI will generate details
                for each exercise.
              </p>
              <TextArea
                value={batchInput}
                onChange={(e) => setBatchInput(e.target.value)}
                placeholder={`Bench Press\nSquat\nDeadlift\nOverhead Press\nBarbell Row`}
                rows={8}
              />
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={handleCloseBatchModal}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  onClick={handleParseBatchInput}
                  disabled={!batchInput.trim()}
                >
                  Continue
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-slate-400 text-sm">
                {batchExercises.filter((ex) => ex.status === 'ready').length} of{' '}
                {batchExercises.length} exercises ready
              </p>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {batchExercises.map((exercise, index) => (
                  <div
                    key={`${exercise.name}-${index}`}
                    className="flex items-start gap-2 bg-slate-800 rounded-lg p-2"
                  >
                    <div className="pt-1">
                      <input
                        type="checkbox"
                        checked={exercise.includeForGeneration}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setBatchExercises((prev) =>
                            prev.map((ex, i) =>
                              i === index
                                ? { ...ex, includeForGeneration: checked }
                                : ex,
                            ),
                          );
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">
                        {exercise.details?.name || exercise.name}
                      </p>
                      {exercise.details && (
                        <p className="text-slate-400 text-xs truncate">
                          {exercise.details.muscle_groups.join(', ')}
                        </p>
                      )}
                      {exercise.duplicates &&
                        exercise.duplicates.length > 0 && (
                          <div className="mt-1 text-amber-400 text-xs">
                            <p className="font-medium">Possible duplicates:</p>
                            <ul className="list-disc list-inside space-y-0.5">
                              {exercise.duplicates.map((dup) => {
                                const parts: string[] = [];
                                if (dup.muscle_groups)
                                  parts.push(dup.muscle_groups);
                                if (dup.equipment) parts.push(dup.equipment);
                                const meta =
                                  parts.length > 0
                                    ? ` (${parts.join(', ')})`
                                    : '';
                                return (
                                  <li key={dup.id} className="truncate">
                                    {dup.name}
                                    {meta}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {exercise.status === 'pending' && (
                        <span className="text-slate-400 text-xs">Pending</span>
                      )}
                      {exercise.status === 'generating' && (
                        <Loader2
                          size={16}
                          className="text-blue-400 animate-spin"
                        />
                      )}
                      {exercise.status === 'ready' && (
                        <Check size={16} className="text-green-400" />
                      )}
                      {exercise.status === 'error' && (
                        <span className="text-red-400 text-xs">Error</span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveBatchExercise(index)}
                        className="text-slate-500 hover:text-red-400 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setBatchExercises([])}
                >
                  Back
                </Button>
                {batchExercises.some((ex) => ex.status === 'pending') && (
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={handleGenerateBatchDetails}
                    disabled={isBatchGenerating || !isOpenAIInitialized()}
                  >
                    {isBatchGenerating ? (
                      <>
                        <Loader2 size={18} className="mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles size={18} className="mr-2" />
                        Generate Details
                      </>
                    )}
                  </Button>
                )}
                {batchExercises.some((ex) => ex.status === 'ready') && (
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={handleSaveBatchExercises}
                    disabled={loading}
                  >
                    Save{' '}
                    {
                      batchExercises.filter((ex) => ex.status === 'ready')
                        .length
                    }{' '}
                    Exercises
                  </Button>
                )}
              </div>
              {!isOpenAIInitialized() && (
                <p className="text-amber-400 text-sm text-center">
                  Set up your OpenAI API key in Settings to use AI generation
                </p>
              )}
            </>
          )}
        </div>
      </Modal>

      {/* Regenerate All Exercises Modal */}
      <Modal
        isOpen={showRegenerateModal}
        onClose={() => {
          if (!isRegenerating) {
            setShowRegenerateModal(false);
            setRegenerateProgress(null);
            setSearchParams({});
          }
        }}
        title="Regenerate All Exercise Details"
      >
        <div className="space-y-4">
          {!isRegenerating && !regenerateProgress?.current ? (
            <>
              <div className="flex items-start gap-3 p-3 bg-amber-900/30 border border-amber-700 rounded-lg">
                <AlertTriangle
                  size={20}
                  className="text-amber-400 flex-shrink-0 mt-0.5"
                />
                <div>
                  <p className="text-amber-300 font-medium">Warning</p>
                  <p className="text-amber-400/80 text-sm">
                    This will regenerate AI details for all {exercises.length}{' '}
                    exercises in your library. Existing descriptions will be
                    overwritten with fresh AI-generated content.
                  </p>
                </div>
              </div>
              <p className="text-slate-400 text-sm">
                This is useful when you've updated the AI prompts and want all
                exercises to benefit from the improvements.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setShowRegenerateModal(false);
                    setSearchParams({});
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleRegenerateAllExercises}
                  disabled={!isOpenAIInitialized()}
                >
                  <RefreshCw size={18} className="mr-2" />
                  Regenerate All
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Progress</span>
                  <span className="text-white">
                    {regenerateProgress?.current || 0} /{' '}
                    {regenerateProgress?.total || exercises.length}
                  </span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${((regenerateProgress?.current || 0) / (regenerateProgress?.total || 1)) * 100}%`,
                    }}
                  />
                </div>
                {regenerateProgress?.currentExercise && (
                  <p className="text-slate-400 text-sm truncate">
                    {isRegenerating ? (
                      <span className="flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" />
                        {regenerateProgress.currentExercise}
                      </span>
                    ) : (
                      regenerateProgress.currentExercise
                    )}
                  </p>
                )}
              </div>

              {regenerateProgress &&
                regenerateProgress.completed.length > 0 && (
                  <div className="max-h-32 overflow-y-auto">
                    <p className="text-green-400 text-sm font-medium mb-1">
                      Completed ({regenerateProgress.completed.length})
                    </p>
                    <div className="text-slate-400 text-xs space-y-0.5">
                      {regenerateProgress.completed.slice(-5).map((name) => (
                        <div key={name} className="flex items-center gap-1">
                          <Check size={12} className="text-green-400" />
                          {name}
                        </div>
                      ))}
                      {regenerateProgress.completed.length > 5 && (
                        <div className="text-slate-500">
                          ...and {regenerateProgress.completed.length - 5} more
                        </div>
                      )}
                    </div>
                  </div>
                )}

              {regenerateProgress && regenerateProgress.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto">
                  <p className="text-red-400 text-sm font-medium mb-1">
                    Errors ({regenerateProgress.errors.length})
                  </p>
                  <div className="text-red-400/80 text-xs space-y-0.5">
                    {regenerateProgress.errors.map((error) => (
                      <div key={error}>{error}</div>
                    ))}
                  </div>
                </div>
              )}

              {!isRegenerating &&
                regenerateProgress?.current === regenerateProgress?.total && (
                  <Button
                    className="w-full"
                    onClick={() => {
                      setShowRegenerateModal(false);
                      setRegenerateProgress(null);
                    }}
                  >
                    Done
                  </Button>
                )}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
