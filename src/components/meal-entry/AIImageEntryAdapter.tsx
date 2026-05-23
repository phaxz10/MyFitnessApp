import { ChevronLeft, Loader2, Minus, Plus, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { mealTypes } from '../../constants/options';
import { useCalories } from '../../hooks/useCalories';
import { analyzeFoodImage } from '../../services/coaching/nutritionCoach';
import type { AIFoodItem, MealType } from '../../types';
import { recalculateMacros } from '../../utils/calculations';
import { Button, CameraCapture, Select, TextArea } from '../ui';
import { describeAIError } from './describeAIError';

interface EditableFoodItem extends AIFoodItem {
  originalPortion: number;
}

interface AIImageEntryAdapterProps {
  date: string;
  initialMealType?: MealType;
  onSubmitted: () => void;
  onBack?: () => void;
}

type Step = 'capture' | 'analyzing' | 'results';

export function AIImageEntryAdapter({
  date,
  initialMealType,
  onSubmitted,
  onBack,
}: AIImageEntryAdapterProps) {
  const { addEntriesBatch } = useCalories();

  const [step, setStep] = useState<Step>('capture');
  const [imageData, setImageData] = useState<{
    base64: string;
    mimeType: string;
  } | null>(null);
  const [mealType, setMealType] = useState<MealType>(
    initialMealType ?? defaultMealTypeForNow(),
  );
  const [description, setDescription] = useState('');
  const [results, setResults] = useState<EditableFoodItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCapture = useCallback(
    (data: { base64: string; mimeType: string }) => {
      setImageData(data);
    },
    [],
  );

  const handleAnalyze = async () => {
    if (!imageData) {
      setError('Please capture or upload an image first');
      return;
    }
    setStep('analyzing');
    setError(null);
    try {
      const result = await analyzeFoodImage(
        imageData.base64,
        imageData.mimeType,
        description || undefined,
      );
      setResults(
        result.items.map((item) => ({
          ...item,
          originalPortion: item.portion_grams,
        })),
      );
      setStep('results');
    } catch (err) {
      setError(
        describeAIError(err, 'Failed to analyze image. Please try again.'),
      );
      setStep('capture');
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
        <p className="text-white font-medium">Analyzing your meal...</p>
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

    const previewUrl = imageData
      ? `data:${imageData.mimeType};base64,${imageData.base64}`
      : null;

    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => {
            setStep('capture');
            setImageData(null);
            setResults([]);
          }}
          className="flex items-center gap-1 text-slate-400 hover:text-white text-sm"
        >
          <ChevronLeft size={16} />
          Scan another
        </button>

        {previewUrl && (
          <img
            src={previewUrl}
            alt="Meal"
            className="w-full h-32 object-cover rounded-lg"
          />
        )}

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
          <div className="bg-slate-700 rounded-lg p-3">
            <p className="text-slate-400 text-xs mb-2">Total</p>
            <div className="flex justify-between text-sm">
              <span className="text-white font-medium">
                {Math.round(totals.calories)} kcal
              </span>
              <span className="text-slate-400">
                P: {Math.round(totals.protein)}g | C: {Math.round(totals.carbs)}
                g | F: {Math.round(totals.fat)}g
              </span>
            </div>
          </div>
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

  // Capture step
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

      {imageData ? (
        <div className="rounded-lg overflow-hidden">
          <div className="relative aspect-[5/7] bg-black">
            <img
              src={`data:${imageData.mimeType};base64,${imageData.base64}`}
              alt="Captured meal"
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => setImageData(null)}
              className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white hover:bg-black/70"
              aria-label="Discard photo"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      ) : (
        <CameraCapture onCapture={handleCapture} />
      )}

      <TextArea
        label="Additional context (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="e.g., homemade, extra cheese, small portion"
        rows={2}
      />

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <Button onClick={handleAnalyze} disabled={!imageData} className="w-full">
        Analyze meal
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
