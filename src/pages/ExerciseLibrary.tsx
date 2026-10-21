import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { BatchAddModal } from '../components/exercise-library/BatchAddModal';
import type {
  BatchExercise,
  RegenerateProgress,
} from '../components/exercise-library/constants';
import { DeleteExerciseModal } from '../components/exercise-library/DeleteExerciseModal';
import { ExerciseDetailsModal } from '../components/exercise-library/ExerciseDetailsModal';
import { ExerciseFormModal } from '../components/exercise-library/ExerciseFormModal';
import { ExerciseList } from '../components/exercise-library/ExerciseList';
import { RegenerateModal } from '../components/exercise-library/RegenerateModal';
import { useExercises } from '../hooks/useExercises';
import { type ExerciseFormData, exerciseFormSchema } from '../schemas/forms';
import { useAICapability } from '../services/ai/useAICapability';
import {
  findDuplicateExercises,
  findDuplicateExercisesBatch,
  generateExerciseDetails,
  generateExerciseDetailsBatch,
} from '../services/coaching/exerciseLibraryCoach';
import type { AIExerciseResponse, Exercise } from '../types';

export function ExerciseLibrary() {
  const [searchParams, setSearchParams] = useSearchParams();
  const aiCapability = useAICapability();
  const aiAvailable = aiCapability.available;
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
  const [batchExercises, setBatchExercises] = useState<BatchExercise[]>([]);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);

  // Regenerate all exercises state
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateProgress, setRegenerateProgress] =
    useState<RegenerateProgress | null>(null);
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
    if (!aiAvailable) {
      alert('Please set up your OpenRouter API key in Settings');
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
  }, [exercises, updateExercise, fetchExercises, setSearchParams, aiAvailable]);

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
    if (!aiAvailable) {
      alert('Please set up your OpenRouter API key in Settings');
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
    if (!aiAvailable) {
      alert('Please set up your OpenRouter API key in Settings');
      return;
    }
    const pendingExercises = batchExercises.filter(
      (ex) => ex.status === 'pending' && ex.includeForGeneration,
    );
    if (pendingExercises.length === 0) return;
    // Batch duplicate check – per row, no global confirm
    if (exercises.length > 0) {
      try {
        // One local screen + at most ONE batched AI call for all rows.
        const duplicateMap: Record<string, Exercise[]> =
          await findDuplicateExercisesBatch(
            pendingExercises.map((ex) => ex.name),
            exercises,
          );
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
  const closeFormModal = () => {
    setShowAddModal(false);
    resetForm();
  };
  const closeRegenerateModal = () => {
    if (!isRegenerating) {
      setShowRegenerateModal(false);
      setRegenerateProgress(null);
      setSearchParams({});
    }
  };

  return (
    <div className="px-4 py-4 space-y-4">
      <ExerciseList
        filteredExercises={filteredExercises}
        groupedExercises={groupedExercises}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedMuscle={selectedMuscle}
        onMuscleChange={setSelectedMuscle}
        onAdd={() => handleOpenAddModal()}
        onBatchAdd={() => setShowBatchModal(true)}
        onSelect={setShowDetailsModal}
      />
      <ExerciseFormModal
        isOpen={showAddModal}
        isEditing={!!editingExercise}
        onClose={closeFormModal}
        onSubmit={handleSubmit(onSubmit)}
        register={register}
        setValue={setValue}
        errors={errors}
        formName={formName}
        formExerciseType={formExerciseType}
        aiAvailable={aiAvailable}
        isGenerating={isGenerating}
        onGenerateDetails={handleGenerateDetails}
        loading={loading}
      />
      <ExerciseDetailsModal
        exercise={showDetailsModal}
        onClose={() => setShowDetailsModal(null)}
        onEdit={(exercise) => {
          handleOpenAddModal(exercise);
          setShowDetailsModal(null);
        }}
        onDelete={setShowDeleteModal}
      />
      <DeleteExerciseModal
        exercise={showDeleteModal}
        onClose={() => setShowDeleteModal(null)}
        onConfirm={handleDeleteExercise}
      />
      <BatchAddModal
        isOpen={showBatchModal}
        onClose={handleCloseBatchModal}
        batchInput={batchInput}
        onBatchInputChange={setBatchInput}
        batchExercises={batchExercises}
        setBatchExercises={setBatchExercises}
        isBatchGenerating={isBatchGenerating}
        aiAvailable={aiAvailable}
        loading={loading}
        onParse={handleParseBatchInput}
        onRemove={handleRemoveBatchExercise}
        onGenerate={handleGenerateBatchDetails}
        onSave={handleSaveBatchExercises}
      />
      <RegenerateModal
        isOpen={showRegenerateModal}
        onClose={closeRegenerateModal}
        onCancel={() => {
          setShowRegenerateModal(false);
          setSearchParams({});
        }}
        onDone={() => {
          setShowRegenerateModal(false);
          setRegenerateProgress(null);
        }}
        onRegenerate={handleRegenerateAllExercises}
        isRegenerating={isRegenerating}
        progress={regenerateProgress}
        exerciseCount={exercises.length}
        aiAvailable={aiAvailable}
      />
    </div>
  );
}
