import { useEffect, useState } from 'react';
import { mealTypes } from '../../constants/options';
import { useCalories } from '../../hooks/useCalories';
import { useProfile } from '../../hooks/useProfile';
import { analyzeFoodText } from '../../services/coaching/nutritionCoach';
import type { MealType } from '../../types';
import { MealImpactPreview, mapSummaryToMacros } from '../nutrition';
import { Button, Select, TextArea } from '../ui';
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
      setResults(toEditableItems(result.items));
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
    return <AnalyzingState label="Analyzing your food..." />;
  }

  if (step === 'results') {
    const totals = sumItems(results);

    return (
      <div className="space-y-4">
        <BackLink
          onClick={() => {
            setStep('input');
            setResults([]);
          }}
        >
          Edit description
        </BackLink>

        <div className="bg-sunken rounded-xl p-3">
          <p className="text-ink-2 text-sm font-semibold">Your description</p>
          <p className="text-ink text-sm">{description}</p>
        </div>

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

  return (
    <div className="space-y-4">
      {onBack && <BackLink onClick={onBack}>Back</BackLink>}

      <Select
        label="Meal type"
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

      {error && <p className="text-danger text-sm text-center">{error}</p>}

      <AIActionButton onClick={handleAnalyze} disabled={!description.trim()}>
        Analyze with AI
      </AIActionButton>
    </div>
  );
}
