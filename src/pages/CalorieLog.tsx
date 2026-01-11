import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, ChevronLeft, ChevronRight, Trash2, Edit2 } from 'lucide-react';
import {
  Card,
  CardContent,
  Button,
  Modal,
  Input,
  Select,
  TextArea,
} from '../components/ui';
import { useCalories } from '../hooks/useCalories';
import { useProfile } from '../hooks/useProfile';
import { useAppStore } from '../hooks/useAppStore';
import { analyzeFoodText } from '../services/gemini';
import { formatDate, formatDisplayDate } from '../utils/date';
import { formatCalories } from '../utils/calculations';
import { foodEntrySchema, type FoodEntryFormData } from '../schemas/forms';
import type { MealType, FoodEntry } from '../types';

const mealTypes: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

export function CalorieLog() {
  const [searchParams] = useSearchParams();
  const { profile, fetchProfile } = useProfile();
  const {
    fetchEntriesByDate,
    addEntry,
    updateEntry,
    deleteEntry,
    getDailySummary,
  } = useCalories();
  const isOnline = useAppStore((state) => state.isOnline);

  const [currentDate, setCurrentDate] = useState(formatDate(new Date()));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useAI, setUseAI] = useState(true);

  // React Hook Form
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
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

  const foodDescription = watch('foodDescription') || '';
  const calories = watch('calories');

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    fetchEntriesByDate(currentDate);
  }, [currentDate, fetchEntriesByDate]);

  const openAddModal = useCallback(() => {
    setIsEditMode(false);
    setEditingEntry(null);
    setUseAI(true);
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
    setIsModalOpen(true);
  }, [reset]);

  useEffect(() => {
    if (searchParams.get('action') === 'add') {
      openAddModal();
    }
  }, [searchParams, openAddModal]);

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
    setIsEditMode(true);
    setEditingEntry(entry);
    setUseAI(false);
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
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
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

  const handleAnalyzeWithAI = async () => {
    if (!foodDescription.trim()) {
      setError('Please enter a food description');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await analyzeFoodText(foodDescription);
      if (result.items.length > 0) {
        const total = result.total;
        const totalPortion = result.items.reduce(
          (sum, item) => sum + item.portion_grams,
          0,
        );
        setValue('portionGrams', totalPortion.toString());
        setValue('calories', total.calories.toString());
        setValue('protein', total.protein_g.toString());
        setValue('carbs', total.carbs_g.toString());
        setValue('fat', total.fat_g.toString());
      }
    } catch {
      setError('Failed to analyze food. Please enter values manually.');
      setUseAI(false);
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (data: FoodEntryFormData) => {
    setIsLoading(true);
    setError(null);

    // Provide default description if empty
    const foodDesc = data.foodDescription?.trim() || 'Food entry';

    try {
      if (isEditMode && editingEntry) {
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
      } else {
        await addEntry({
          date: currentDate,
          meal_type: data.mealType,
          food_description: foodDesc,
          portion_grams: parseFloat(data.portionGrams || '0'),
          calories: parseInt(data.calories, 10),
          protein_g: parseFloat(data.protein),
          carbs_g: parseFloat(data.carbs),
          fat_g: parseFloat(data.fat),
          is_ai_generated: useAI,
        });
      }
      handleCloseModal();
    } catch (err) {
      console.error('Failed to save entry:', err);
      setError('Failed to save entry');
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
    setIsEditMode(false);
    setEditingEntry(null);
    setUseAI(true);
    reset({
      mealType,
      foodDescription: '',
      portionGrams: '',
      calories: '',
      protein: '',
      carbs: '',
      fat: '',
    });
    setError(null);
    setIsModalOpen(true);
  };

  return (
    <div className="p-4 pb-20">
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
        </CardContent>
      </Card>

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

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={isEditMode ? 'Edit Entry' : 'Add Food Entry'}
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

          {!isEditMode && isOnline && profile?.gemini_api_key && (
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleAnalyzeWithAI}
                isLoading={isLoading}
                disabled={!foodDescription.trim()}
                className="flex-1"
              >
                Analyze with AI
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setUseAI(false)}
              >
                Manual
              </Button>
            </div>
          )}

          {(!useAI || !isOnline || !profile?.gemini_api_key || calories) && (
            <>
              <Input
                label="Portion (grams)"
                type="number"
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
            </>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCloseModal}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={isLoading} className="flex-1">
              {isEditMode ? 'Update' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
