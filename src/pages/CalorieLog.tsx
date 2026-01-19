import { zodResolver } from '@hookform/resolvers/zod';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit2,
  Plus,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  CalorieLogSkeleton,
  Card,
  CardContent,
  Input,
  Modal,
  Select,
  TextArea,
} from '../components/ui';
import { mealTypes } from '../constants/options';
import { useAppStore } from '../hooks/useAppStore';
import { useCalories } from '../hooks/useCalories';
import { useProfile } from '../hooks/useProfile';
import { type FoodEntryFormData, foodEntrySchema } from '../schemas/forms';
import type { FoodEntry, MealType } from '../types';
import { formatCalories } from '../utils/calculations';
import { formatDate, formatDisplayDate, getPreviousDay } from '../utils/date';

export function CalorieLog() {
  const [searchParams] = useSearchParams();
  const { profile } = useProfile();
  const {
    fetchEntriesByDate,
    updateEntry,
    deleteEntry,
    getDailySummary,
    copyMealsFromPreviousDay,
    loading: caloriesLoading,
  } = useCalories();
  const { openFoodLogModal } = useAppStore();

  const [currentDate, setCurrentDate] = useState(() => {
    // Initialize from URL param or default to today
    const urlDate = new URLSearchParams(window.location.search).get('date');
    return urlDate || formatDate(new Date());
  });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  // React Hook Form for edit modal
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FoodEntryFormData>({
    resolver: zodResolver(foodEntrySchema),
    defaultValues: {
      mealType: 'breakfast',
      foodDescription: '',
      portionGrams: '',
      calories: '',
      protein: '',
      carbs: '',
      fat: '',
    },
  });

  // Sync currentDate with URL param when it changes
  useEffect(() => {
    const urlDate = searchParams.get('date');
    if (urlDate && urlDate !== currentDate) {
      setCurrentDate(urlDate);
    }
  }, [searchParams, currentDate]);

  const loadEntries = useCallback(async () => {
    await fetchEntriesByDate(currentDate);
  }, [currentDate, fetchEntriesByDate]);

  useEffect(() => {
    const loadData = async () => {
      setInitialLoading(true);
      try {
        await loadEntries();
      } finally {
        setInitialLoading(false);
      }
    };
    loadData();
  }, [loadEntries]);

  // Handle URL action=add param to open global modal
  useEffect(() => {
    if (searchParams.get('action') === 'add') {
      openFoodLogModal({
        date: currentDate,
        onSuccess: loadEntries,
      });
    }
  }, [searchParams, currentDate, openFoodLogModal, loadEntries]);

  const summary = getDailySummary(currentDate);

  const goToPreviousDay = () => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() - 1);
    setCurrentDate(formatDate(date));
  };

  const goToNextDay = () => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + 1);
    setCurrentDate(formatDate(date));
  };

  const openEditModal = (entry: FoodEntry) => {
    setEditingEntry(entry);
    reset({
      mealType: entry.meal_type,
      foodDescription: entry.food_description,
      portionGrams: entry.portion_grams.toString(),
      calories: entry.calories.toString(),
      protein: entry.protein_g.toString(),
      carbs: entry.carbs_g.toString(),
      fat: entry.fat_g.toString(),
    });
    setError(null);
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingEntry(null);
    reset({
      mealType: 'breakfast',
      foodDescription: '',
      portionGrams: '',
      calories: '',
      protein: '',
      carbs: '',
      fat: '',
    });
    setError(null);
  };

  const onEditSubmit = async (data: FoodEntryFormData) => {
    if (!editingEntry) return;

    setIsLoading(true);
    setError(null);

    const foodDesc = data.foodDescription?.trim() || 'Food entry';

    try {
      await updateEntry(editingEntry.id, {
        meal_type: data.mealType,
        food_description: foodDesc,
        portion_grams: parseFloat(data.portionGrams || '0'),
        calories: parseInt(data.calories, 10),
        protein_g: parseFloat(data.protein),
        carbs_g: parseFloat(data.carbs),
        fat_g: parseFloat(data.fat),
      });
      await fetchEntriesByDate(currentDate);
      handleCloseEditModal();
    } catch (err) {
      console.error('Failed to update entry:', err);
      setError('Failed to update entry');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (entry: FoodEntry) => {
    if (confirm('Are you sure you want to delete this entry?')) {
      await deleteEntry(entry.id, currentDate);
    }
  };

  const handleOpenAddModalForMeal = (mealType: MealType) => {
    openFoodLogModal({
      date: currentDate,
      mealType,
      onSuccess: loadEntries,
    });
  };

  const handleCopyPreviousDay = async () => {
    try {
      setCopySuccess(null);
      setError(null);
      const count = await copyMealsFromPreviousDay(currentDate);
      setCopySuccess(
        `Copied ${count} meal${count !== 1 ? 's' : ''} from ${formatDisplayDate(getPreviousDay(currentDate))}`,
      );
      // Auto-hide success message after 3 seconds
      setTimeout(() => setCopySuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy meals');
    }
  };

  if (initialLoading) {
    return <CalorieLogSkeleton />;
  }

  return (
    <div className="p-4 pb-20">
      {/* Page Title */}
      <h1 className="text-xl font-bold text-white mb-4">Nutrition</h1>

      {/* Date Navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={goToPreviousDay}
          className="p-2 text-slate-400 hover:text-white"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="text-center">
          <h2 className="text-xl font-semibold text-white">
            {formatDisplayDate(currentDate)}
          </h2>
          {currentDate === formatDate(new Date()) && (
            <span className="text-blue-400 text-sm">Today</span>
          )}
        </div>
        <button
          type="button"
          onClick={goToNextDay}
          className="p-2 text-slate-400 hover:text-white"
        >
          <ChevronRight size={24} />
        </button>
      </div>

      {/* Daily Summary */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-slate-400 text-sm">Total Calories</p>
              <p className="text-2xl font-bold text-white">
                {formatCalories(summary.total_calories)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-slate-400 text-sm">Target</p>
              <p className="text-xl text-slate-300">
                {formatCalories(profile?.calorie_target || 0)}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="bg-slate-700/50 rounded-lg p-2">
              <p className="text-blue-400 font-semibold">
                {summary.total_protein_g.toFixed(0)}g
              </p>
              <p className="text-slate-400 text-xs">Protein</p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-2">
              <p className="text-green-400 font-semibold">
                {summary.total_carbs_g.toFixed(0)}g
              </p>
              <p className="text-slate-400 text-xs">Carbs</p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-2">
              <p className="text-yellow-400 font-semibold">
                {summary.total_fat_g.toFixed(0)}g
              </p>
              <p className="text-slate-400 text-xs">Fat</p>
            </div>
          </div>

          {/* Copy Previous Day Button */}
          <button
            type="button"
            onClick={handleCopyPreviousDay}
            disabled={caloriesLoading}
            className="mt-4 w-full py-2 border border-dashed border-slate-600 rounded-lg text-slate-400 hover:text-white hover:border-slate-500 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Copy size={16} />
            Copy meals from yesterday
          </button>
        </CardContent>
      </Card>

      {/* Success/Error Messages */}
      {copySuccess && (
        <div className="bg-green-500/20 text-green-400 px-4 py-2 rounded-lg mb-4">
          {copySuccess}
        </div>
      )}
      {error && (
        <div className="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Meal Sections */}
      {mealTypes.map(({ value, label }) => {
        const mealEntries = summary.meals[value];
        const mealCalories = mealEntries.reduce(
          (sum, e) => sum + e.calories,
          0,
        );

        return (
          <Card key={value} className="mb-3">
            <CardContent className="p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-semibold text-white">{label}</h3>
                <span className="text-slate-400">{mealCalories} kcal</span>
              </div>

              {mealEntries.length === 0 ? (
                <p className="text-slate-500 text-sm py-2">No entries</p>
              ) : (
                <div className="space-y-2">
                  {mealEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between bg-slate-700/30 rounded-lg p-3"
                    >
                      <div className="flex-1">
                        <p className="text-white text-sm">
                          {entry.food_description}
                        </p>
                        <p className="text-slate-400 text-xs">
                          {entry.calories} kcal | P: {entry.protein_g}g | C:{' '}
                          {entry.carbs_g}g | F: {entry.fat_g}g
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(entry)}
                          className="p-2 text-slate-400 hover:text-blue-400"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(entry)}
                          className="p-2 text-slate-400 hover:text-red-400"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => handleOpenAddModalForMeal(value)}
                className="mt-3 w-full py-2 border border-dashed border-slate-600 rounded-lg text-slate-400 hover:text-white hover:border-slate-500 transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={16} />
                Add {label}
              </button>
            </CardContent>
          </Card>
        );
      })}

      {/* Edit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        title="Edit Entry"
        size="lg"
      >
        <form onSubmit={handleSubmit(onEditSubmit)} className="space-y-4">
          <Select
            label="Meal Type"
            {...register('mealType')}
            options={mealTypes}
            error={errors.mealType?.message}
          />

          <TextArea
            label="Food Description"
            {...register('foodDescription')}
            placeholder="e.g., 50g cooked rice, 100g pork adobo"
            rows={3}
            error={errors.foodDescription?.message}
          />

          <Input
            label="Portion (grams)"
            type="number"
            step="5"
            {...register('portionGrams')}
            placeholder="Optional"
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Calories"
              type="number"
              {...register('calories')}
              placeholder="kcal"
              error={errors.calories?.message}
            />
            <Input
              label="Protein (g)"
              type="number"
              step="0.1"
              {...register('protein')}
              placeholder="grams"
              error={errors.protein?.message}
            />
            <Input
              label="Carbs (g)"
              type="number"
              step="0.1"
              {...register('carbs')}
              placeholder="grams"
              error={errors.carbs?.message}
            />
            <Input
              label="Fat (g)"
              type="number"
              step="0.1"
              {...register('fat')}
              placeholder="grams"
              error={errors.fat?.message}
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCloseEditModal}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={isLoading} className="flex-1">
              Update
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
