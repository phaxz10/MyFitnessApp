import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { mealTypes } from '../../constants/options';
import { useCalories } from '../../hooks/useCalories';
import { type FoodEntryFormData, foodEntrySchema } from '../../schemas/forms';
import type { MealType } from '../../types';
import { Button, Input, Select, TextArea } from '../ui';
import { BackLink } from './AIResultParts';
import { defaultMealTypeForNow } from './aiResults';

interface ManualEntryAdapterProps {
  date: string;
  initialMealType?: MealType;
  onSubmitted: () => void;
  onBack?: () => void;
}

export function ManualEntryAdapter({
  date,
  initialMealType,
  onSubmitted,
  onBack,
}: ManualEntryAdapterProps) {
  const { addEntry } = useCalories();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FoodEntryFormData>({
    resolver: zodResolver(foodEntrySchema),
    defaultValues: {
      mealType: initialMealType ?? defaultMealTypeForNow(),
      foodDescription: '',
      portionGrams: '',
      calories: '',
      protein: '',
      carbs: '',
      fat: '',
    },
  });

  useEffect(() => {
    if (initialMealType) {
      setValue('mealType', initialMealType);
    }
  }, [initialMealType, setValue]);

  const calories = watch('calories');

  const onSubmit = async (data: FoodEntryFormData) => {
    setIsSaving(true);
    setError(null);
    try {
      await addEntry({
        date,
        meal_type: data.mealType,
        food_description: data.foodDescription || 'Food entry',
        portion_grams: data.portionGrams ? parseFloat(data.portionGrams) : 100,
        calories: parseFloat(data.calories),
        protein_g: parseFloat(data.protein),
        carbs_g: parseFloat(data.carbs),
        fat_g: parseFloat(data.fat),
        is_ai_generated: false,
      });
      onSubmitted();
    } catch {
      setError('Failed to save entry');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {onBack && <BackLink onClick={onBack}>Back</BackLink>}

      <Select label="Meal type" options={mealTypes} {...register('mealType')} />

      <TextArea
        label="Food description"
        {...register('foodDescription')}
        placeholder="e.g., grilled chicken breast with rice"
        rows={2}
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Portion (g)"
          type="number"
          step="5"
          {...register('portionGrams')}
          placeholder="100"
        />
        <Input
          label="Calories"
          type="number"
          {...register('calories')}
          placeholder="kcal"
          error={errors.calories?.message}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Input
          label="Protein (g)"
          type="number"
          step="0.1"
          {...register('protein')}
          placeholder="0"
          error={errors.protein?.message}
        />
        <Input
          label="Carbs (g)"
          type="number"
          step="0.1"
          {...register('carbs')}
          placeholder="0"
          error={errors.carbs?.message}
        />
        <Input
          label="Fat (g)"
          type="number"
          step="0.1"
          {...register('fat')}
          placeholder="0"
          error={errors.fat?.message}
        />
      </div>

      {error && <p className="text-danger text-sm text-center">{error}</p>}

      <Button
        type="submit"
        tone="eat"
        size="lg"
        disabled={isSaving || !calories}
        className="w-full"
      >
        {isSaving ? 'Saving...' : 'Save Entry'}
      </Button>
    </form>
  );
}
