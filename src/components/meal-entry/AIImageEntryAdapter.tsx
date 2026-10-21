import { X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { mealTypes } from '../../constants/options';
import { useCalories } from '../../hooks/useCalories';
import { useProfile } from '../../hooks/useProfile';
import { analyzeFoodImage } from '../../services/coaching/nutritionCoach';
import type { MealType } from '../../types';
import { MealImpactPreview, mapSummaryToMacros } from '../nutrition';
import { Button, CameraCapture, Select, TextArea } from '../ui';
import {
  AIActionButton,
  AnalyzingState,
  BackLink,
  FoodItemList,
} from './AIResultParts';
import {
  defaultMealTypeForNow,
  type EditableFoodItem,
  sumItems,
  toEditableItems,
  withPortion,
} from './aiResults';
import { describeAIError } from './describeAIError';

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
  const { addEntriesBatch, fetchEntriesByDate, getDailySummary } =
    useCalories();
  const { profile } = useProfile();

  // Ensure today's existing entries are loaded so MealImpactPreview can show
  // an accurate "after saving" projection. Best-effort: if it fails, the
  // preview falls back to showing only this meal's contribution.
  useEffect(() => {
    void fetchEntriesByDate(date);
  }, [date, fetchEntriesByDate]);

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
      // The analyzer explicitly returns empty items + not_food_reason when
      // the photo isn't food (a pet, a landscape, a blurry shot). Surface
      // that as a friendly message rather than dropping the user into an
      // empty results screen.
      if (result.items.length === 0) {
        setError(
          result.not_food_reason
            ? `No food detected: ${result.not_food_reason}`
            : 'No food detected in this image. Please try a clearer photo of your meal.',
        );
        setStep('capture');
        return;
      }
      setResults(toEditableItems(result.items));
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
      prev.map((item, i) =>
        i === index ? withPortion(item, newPortion) : item,
      ),
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
    return <AnalyzingState label="Analyzing your meal..." />;
  }

  if (step === 'results') {
    const totals = sumItems(results);

    const previewUrl = imageData
      ? `data:${imageData.mimeType};base64,${imageData.base64}`
      : null;

    return (
      <div className="space-y-4">
        <BackLink
          onClick={() => {
            setStep('capture');
            setImageData(null);
            setResults([]);
          }}
        >
          Scan another
        </BackLink>

        {previewUrl && (
          <img
            src={previewUrl}
            alt="Meal"
            className="w-full h-32 object-cover rounded-xl"
          />
        )}

        <FoodItemList
          items={results}
          onPortionChange={handlePortionChange}
          onRemove={handleRemoveItem}
        />

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

        {error && <p className="text-danger text-sm text-center">{error}</p>}

        <Button
          tone="eat"
          size="lg"
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
      {onBack && <BackLink onClick={onBack}>Back</BackLink>}

      <Select
        label="Meal type"
        options={mealTypes}
        value={mealType}
        onChange={(e) => setMealType(e.target.value as MealType)}
      />

      {imageData ? (
        <div className="rounded-xl overflow-hidden">
          <div className="relative aspect-[5/7] bg-black">
            <img
              src={`data:${imageData.mimeType};base64,${imageData.base64}`}
              alt="Captured meal"
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => setImageData(null)}
              className="absolute top-1 right-1 grid place-items-center size-11 bg-black/50 rounded-full text-white hover:bg-black/70"
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

      {error && <p className="text-danger text-sm text-center">{error}</p>}

      <AIActionButton onClick={handleAnalyze} disabled={!imageData}>
        Analyze meal
      </AIActionButton>
    </div>
  );
}
