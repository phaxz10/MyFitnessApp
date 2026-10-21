import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { DailySummaryCard, FoodEntryRow } from '../components/nutrition';
import {
  Button,
  CalorieLogSkeleton,
  Card,
  CardHeader,
  CardTitle,
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
    copyEntryToMeal,
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
  const [copyMenuEntryId, setCopyMenuEntryId] = useState<number | null>(null);
  const copyMenuRef = useRef<HTMLDivElement>(null);

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

  const handleCopyEntryToMeal = async (
    entry: FoodEntry,
    targetMealType: MealType,
  ) => {
    try {
      setCopySuccess(null);
      setError(null);
      setCopyMenuEntryId(null);
      await copyEntryToMeal(entry, targetMealType);
      const targetLabel =
        mealTypes.find((m) => m.value === targetMealType)?.label ||
        targetMealType;
      setCopySuccess(`Copied "${entry.food_description}" to ${targetLabel}`);
      setTimeout(() => setCopySuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy entry');
    }
  };

  // Close copy menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        copyMenuRef.current &&
        !copyMenuRef.current.contains(event.target as Node)
      ) {
        setCopyMenuEntryId(null);
      }
    };

    if (copyMenuEntryId !== null) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [copyMenuEntryId]);

  if (initialLoading) {
    return <CalorieLogSkeleton />;
  }

  const isToday = currentDate === formatDate(new Date());

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Date switcher */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goToPreviousDay}
          className="grid place-items-center size-11 rounded-xl border border-line text-ink hover:bg-sunken"
          aria-label="Previous day"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="text-center">
          <h2 className="text-lg font-bold text-ink">
            {formatDisplayDate(currentDate)}
          </h2>
          {isToday && (
            <span className="inline-block px-2 rounded-full bg-eat-soft text-eat-ink text-sm font-semibold">
              Today
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={goToNextDay}
          className="grid place-items-center size-11 rounded-xl border border-line text-ink hover:bg-sunken"
          aria-label="Next day"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      <DailySummaryCard
        summary={summary}
        profile={profile ?? null}
        onCopyPreviousDay={handleCopyPreviousDay}
        copyLoading={caloriesLoading}
      />

      {/* Success/Error Messages */}
      {copySuccess && (
        <div
          role="status"
          className="bg-eat-soft text-eat-ink px-4 py-3 rounded-xl text-sm font-medium"
        >
          {copySuccess}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="bg-danger-soft text-danger px-4 py-3 rounded-xl text-sm font-medium"
        >
          {error}
        </div>
      )}

      {/* Meals */}
      {mealTypes.map(({ value, label }) => {
        const mealEntries = summary.meals[value];
        const mealCalories = mealEntries.reduce(
          (sum, e) => sum + e.calories,
          0,
        );

        return (
          <Card key={value}>
            <CardHeader className="flex items-baseline justify-between">
              <CardTitle>{label}</CardTitle>
              <span className="num text-ink-2">
                <span className="text-lg font-bold text-ink">
                  {Math.round(mealCalories)}
                </span>{' '}
                kcal
              </span>
            </CardHeader>

            {mealEntries.length === 0 ? (
              <p className="text-ink-3 text-sm px-4 py-3">
                Nothing logged for {label.toLowerCase()} yet.
              </p>
            ) : (
              <div className="divide-y divide-line">
                {mealEntries.map((entry) => (
                  <FoodEntryRow
                    key={entry.id}
                    entry={entry}
                    onEdit={openEditModal}
                    onDelete={handleDelete}
                    onCopyToMeal={handleCopyEntryToMeal}
                    isCopyMenuOpen={copyMenuEntryId === entry.id}
                    onToggleCopyMenu={() =>
                      setCopyMenuEntryId(
                        copyMenuEntryId === entry.id ? null : entry.id,
                      )
                    }
                    copyMenuRef={copyMenuRef}
                    availableMealTargets={mealTypes.filter(
                      (m) => m.value !== entry.meal_type,
                    )}
                  />
                ))}
              </div>
            )}

            <div className="p-3 border-t border-line">
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => handleOpenAddModalForMeal(value)}
              >
                <Plus size={18} aria-hidden="true" />
                Add {label.toLowerCase()}
              </Button>
            </div>
          </Card>
        );
      })}

      {/* Edit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        title="Edit entry"
        size="lg"
      >
        <form onSubmit={handleSubmit(onEditSubmit)} className="space-y-4">
          <Select
            label="Meal type"
            {...register('mealType')}
            options={mealTypes}
            error={errors.mealType?.message}
          />

          <TextArea
            label="Food description"
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

          {error && <p className="text-danger text-sm">{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCloseEditModal}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              tone="eat"
              isLoading={isLoading}
              className="flex-1"
            >
              Update
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
