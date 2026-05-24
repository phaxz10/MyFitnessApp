import { ChevronLeft, Loader2, Minus, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { mealTypes } from '../../constants/options';
import { useCalories } from '../../hooks/useCalories';
import { useProfile } from '../../hooks/useProfile';
import { analyzeFoodText } from '../../services/coaching/nutritionCoach';
import type { AIFoodItem, MealType } from '../../types';
import { recalculateMacros } from '../../utils/calculations';
import { MealImpactPreview, mapSummaryToMacros } from '../nutrition';
import { Button, Select, TextArea } from '../ui';
import { describeAIError } from './describeAIError';

interface EditableFoodItem extends AIFoodItem {
  originalPortion: number;
}

interface AITextEntryAdapterProps {
  date: string;
  initialMealType?: MealType;
  onSubmitted: () => void;
  onBack?: () => void;
}

type Step = 'input' | 'analyzing' | 'results';

export function AITextEntryAdapter({
  initialMealType,
  date,
  onSubmitted,
  onBack,
}: AITextEntryAdapterProps) {
  const { addEntriesBatch, fetchEntriesByDate, getDailySummary } =
    useCalories();
  const { profile } = useProfile();

  // Load today's existing entries so the impact preview can show an accurate
  // "after saving" projection.
  useEffect(() => {
    void fetchEntriesByDate(date);
  }, [date, fetchEntriesByDate]);

  const [step, setStep] = useState<Step>('input');
  const [mealType, setMealType] = useState<MealType>(
    initialMealType ?? defaultMealTypeForNow(),
  );
  const [description, setDescription] = useState('');
  const [results, setResults] = useState<EditableFoodItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!description.trim()) {
      setError('Please describe your food');
      return;
    }

    setStep('analyzing');
    setError(null);

    try {
      const result = await analyzeFoodText(description);
      // The analyzer explicitly returns empty items + not_food_reason when
      // the description isn't food (e.g. "my dog", random characters).
      // Surface that as a friendly message rather than an empty results screen.
      if (result.items.length === 0) {
        setError(
          result.not_food_reason
            ? `That doesn't seem to be food: ${result.not_food_reason}`
            : "That doesn't seem to describe any food. Please describe your meal.",
        );
        setStep('input');
        return;
      }
      setResults(
        result.items.map((item) => ({
          ...item,
          originalPortion: item.portion_grams,
        })),
      );
      setStep('results');
    } catch (err) {
      setError(
        describeAIError(err, 'Failed to analyze food. Please try again.'),
      );
      setStep('input');
    }
  };

  const handlePortionChange = (index: number, newPortion: number) => {
    setResults((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const ratio = item.originalPortion / item.portion_grams;
        const recalculated = recalculateMacros(
          item.originalPortion,
          newPortion,
          {
            calories: item.calories * ratio,
            protein_g: item.protein_g * ratio,
            carbs_g: item.carbs_g * ratio,
            fat_g: item.fat_g * ratio,
          },
        );
        return {
          ...item,
          portion_grams: newPortion,
          ...recalculated,
        };
      }),
    );
  };

  const handleRemoveItem = (index: number) => {
    setResults((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (results.length === 0) {
      setError('No food items to save');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await addEntriesBatch(
        results.map((item) => ({
          date,
          meal_type: mealType,
          food_description: item.name,
          portion_grams: item.portion_grams,
          calories: item.calories,
          protein_g: item.protein_g,
          carbs_g: item.carbs_g,
          fat_g: item.fat_g,
          is_ai_generated: true,
        })),
      );
      onSubmitted();
    } catch {
      setError('Failed to save entries');
    } finally {
      setIsSaving(false);
    }
  };

  if (step === 'analyzing') {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 size={48} className="text-blue-400 animate-spin mb-4" />
        <p className="text-white font-medium">Analyzing your food...</p>
        <p className="text-slate-400 text-sm">This may take a few seconds</p>
      </div>
    );
  }

  if (step === 'results') {
    const totals = results.reduce(
      (acc, item) => ({
        calories: acc.calories + item.calories,
        protein: acc.protein + item.protein_g,
        carbs: acc.carbs + item.carbs_g,
        fat: acc.fat + item.fat_g,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );

    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => {
            setStep('input');
            setResults([]);
          }}
          className="flex items-center gap-1 text-slate-400 hover:text-white text-sm"
        >
          <ChevronLeft size={16} />
          Edit description
        </button>

        <div className="bg-slate-700/30 rounded-lg p-2">
          <p className="text-slate-400 text-xs">Your description:</p>
          <p className="text-white text-sm">{description}</p>
        </div>

        <div className="space-y-2">
          {results.map((item, index) => (
            <div
              key={`${item.name}-${index}`}
              className="bg-slate-700/50 rounded-lg p-3"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <p className="text-white font-medium text-sm">{item.name}</p>
                  <p className="text-slate-400 text-xs">
                    {Math.round(item.calories)} kcal | P:{' '}
                    {Math.round(item.protein_g)}g | C:{' '}
                    {Math.round(item.carbs_g)}g | F: {Math.round(item.fat_g)}g
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveItem(index)}
                  className="text-slate-400 hover:text-red-400 p-1"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handlePortionChange(
                      index,
                      Math.max(5, item.portion_grams - 5),
                    )
                  }
                  className="p-1 bg-slate-600 rounded hover:bg-slate-500"
                >
                  <Minus size={14} className="text-white" />
                </button>
                <span className="text-white text-sm min-w-[60px] text-center">
                  {Math.round(item.portion_grams / 5) * 5}g
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handlePortionChange(index, item.portion_grams + 5)
                  }
                  className="p-1 bg-slate-600 rounded hover:bg-slate-500"
                >
                  <Plus size={14} className="text-white" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {results.length > 0 && (
          <MealImpactPreview
            meal={totals}
            todayBefore={mapSummaryToMacros(getDailySummary(date))}
            targets={{
              calories: profile?.calorie_target ?? 0,
              protein: profile?.protein_target_g ?? 0,
              carbs: profile?.carbs_target_g ?? 0,
              fat: profile?.fat_target_g ?? 0,
            }}
          />
        )}

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <Button
          onClick={handleSave}
          disabled={isSaving || results.length === 0}
          className="w-full"
        >
          {isSaving
            ? 'Saving...'
            : `Save ${results.length} Item${results.length !== 1 ? 's' : ''}`}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-slate-400 hover:text-white text-sm"
        >
          <ChevronLeft size={16} />
          Back
        </button>
      )}

      <Select
        label="Meal Type"
        options={mealTypes}
        value={mealType}
        onChange={(e) => setMealType(e.target.value as MealType)}
      />

      <TextArea
        label="Describe your food"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="e.g., 2 eggs, 2 slices of toast with butter, glass of orange juice"
        rows={3}
      />

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <Button
        onClick={handleAnalyze}
        disabled={!description.trim()}
        className="w-full"
      >
        Analyze with AI
      </Button>
    </div>
  );
}

function defaultMealTypeForNow(): MealType {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 10) return 'breakfast';
  if (hour >= 11 && hour < 14) return 'lunch';
  if (hour >= 17 && hour < 21) return 'dinner';
  return 'snack';
}
