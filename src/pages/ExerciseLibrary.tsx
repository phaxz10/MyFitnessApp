import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  Plus,
  Search,
  Trash2,
  Edit,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import {
  Card,
  CardContent,
  Button,
  Input,
  Modal,
  TextArea,
} from '../components/ui';
import { useExercises } from '../hooks/useExercises';
import {
  generateExerciseDetails,
  isGeminiInitialized,
} from '../services/gemini';
import { exerciseFormSchema, type ExerciseFormData } from '../schemas/forms';
import type { Exercise, AIExerciseResponse } from '../types';

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

export function ExerciseLibrary() {
  const navigate = useNavigate();
  const {
    exercises,
    fetchExercises,
    addExercise,
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);

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
    },
  });

  const formName = watch('name');

  useEffect(() => {
    fetchExercises();
  }, [fetchExercises]);

  const filteredExercises = exercises.filter((ex) => {
    const matchesSearch =
      ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ex.muscle_groups?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ex.equipment?.toLowerCase().includes(searchQuery.toLowerCase());

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

    if (!isGeminiInitialized()) {
      alert('Please set up your Gemini API key in Settings');
      return;
    }

    setIsGenerating(true);
    try {
      const details: AIExerciseResponse =
        await generateExerciseDetails(formName);
      setValue('description', details.description);
      setValue('muscleGroups', details.muscle_groups.join(', '));
      setValue('equipment', details.equipment);
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
        });
      } else {
        await addExercise({
          name: data.name,
          description: data.description || '',
          muscle_groups: data.muscleGroups || '',
          equipment: data.equipment || '',
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
    if (showDeleteModal) {
      try {
        await deleteExercise(showDeleteModal.id);
        setShowDeleteModal(null);
        setShowDetailsModal(null);
      } catch (err) {
        console.error('Failed to delete exercise:', err);
        alert('Failed to delete exercise. It may be used in a program.');
      }
    }
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
    <div className="p-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 text-slate-400 hover:text-white"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold text-white">Exercise Library</h1>
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

      {/* Add Exercise Button */}
      <Button className="w-full mb-4" onClick={() => handleOpenAddModal()}>
        <Plus size={18} className="mr-2" />
        Add New Exercise
      </Button>

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
              {isGeminiInitialized() && (
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
            <label htmlFor="description" className="block text-slate-400 text-sm mb-1">
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
            <label htmlFor="muscleGroups" className="block text-slate-400 text-sm mb-1">
              Muscle Groups
            </label>
            <Input
              id="muscleGroups"
              {...register('muscleGroups')}
              placeholder="e.g., Chest, Shoulders, Triceps"
            />
          </div>

          <div>
            <label htmlFor="equipment" className="block text-slate-400 text-sm mb-1">
              Equipment
            </label>
            <Input
              id="equipment"
              {...register('equipment')}
              placeholder="e.g., Barbell, Bench"
            />
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
    </div>
  );
}
