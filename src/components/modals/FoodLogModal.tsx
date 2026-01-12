import { useState, useRef, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  FileText,
  Camera,
  ChevronRight,
  ChevronLeft,
  Plus,
  Minus,
  X,
  Loader2,
  PenLine,
} from 'lucide-react';
import { Modal, Button, Input, Select, TextArea } from '../ui';
import { useCalories } from '../../hooks/useCalories';
import { useAppStore } from '../../hooks/useAppStore';
import {
  analyzeFoodText,
  analyzeFoodImage,
  isGeminiInitialized,
} from '../../services/gemini';
import { formatDisplayDate } from '../../utils/date';
import { recalculateMacros } from '../../utils/calculations';
import { foodEntrySchema, type FoodEntryFormData } from '../../schemas/forms';
import type { MealType, AIFoodItem } from '../../types';

const mealTypes: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

interface EditableFoodItem extends AIFoodItem {
  originalPortion: number;
}

export function FoodLogModal() {
  const { foodLogModal, closeFoodLogModal, setFoodLogModalMode, isOnline } =
    useAppStore();
  const { addEntry } = useCalories();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Text mode state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Scanner mode state
  const [scannerStep, setScannerStep] = useState<
    'capture' | 'analyzing' | 'results'
  >('capture');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{
    base64: string;
    mimeType: string;
  } | null>(null);
  const [scannerResults, setScannerResults] = useState<EditableFoodItem[]>([]);
  const [scannerMealType, setScannerMealType] = useState<MealType>('lunch');
  const [scannerDescription, setScannerDescription] = useState('');

  // React Hook Form for text mode
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

  // Reset state when modal opens/closes
  useEffect(() => {
    if (foodLogModal.isOpen) {
      // Set meal type if provided
      if (foodLogModal.mealType) {
        setValue('mealType', foodLogModal.mealType);
        setScannerMealType(foodLogModal.mealType);
      }
      setError(null);
    } else {
      // Reset all state when closed
      reset();
      setError(null);
      setIsAnalyzing(false);
      setIsSaving(false);
      setScannerStep('capture');
      setImagePreview(null);
      setImageData(null);
      setScannerResults([]);
      setScannerDescription('');
    }
  }, [foodLogModal.isOpen, foodLogModal.mealType, setValue, reset]);

  const handleClose = useCallback(() => {
    closeFoodLogModal();
  }, [closeFoodLogModal]);

  // === TEXT MODE HANDLERS ===
  const handleAnalyzeText = async () => {
    if (!foodDescription.trim()) {
      setError('Please describe your food');
      return;
    }

    if (!isOnline) {
      setError('Internet connection required for AI analysis');
      return;
    }

    if (!isGeminiInitialized()) {
      setError('Please add your Gemini API key in Settings');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const result = await analyzeFoodText(foodDescription);

      // Calculate totals from items
      const total = result.items.reduce(
        (acc, item) => ({
          calories: acc.calories + item.calories,
          protein_g: acc.protein_g + item.protein_g,
          carbs_g: acc.carbs_g + item.carbs_g,
          fat_g: acc.fat_g + item.fat_g,
          portion_grams: acc.portion_grams + item.portion_grams,
        }),
        { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, portion_grams: 0 },
      );

      setValue('portionGrams', total.portion_grams.toString());
      setValue('calories', Math.round(total.calories).toString());
      setValue('protein', Math.round(total.protein_g).toString());
      setValue('carbs', Math.round(total.carbs_g).toString());
      setValue('fat', Math.round(total.fat_g).toString());
    } catch {
      setError('Failed to analyze food. Please try again or enter manually.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const onTextSubmit = async (data: FoodEntryFormData) => {
    setIsSaving(true);
    setError(null);

    try {
      await addEntry({
        date: foodLogModal.date,
        meal_type: data.mealType,
        food_description: data.foodDescription || 'Food entry',
        portion_grams: data.portionGrams ? parseFloat(data.portionGrams) : 100,
        calories: parseFloat(data.calories),
        protein_g: parseFloat(data.protein),
        carbs_g: parseFloat(data.carbs),
        fat_g: parseFloat(data.fat),
        is_ai_generated: true,
      });

      foodLogModal.onSuccess?.();
      handleClose();
    } catch {
      setError('Failed to save entry');
    } finally {
      setIsSaving(false);
    }
  };

  // === SCANNER MODE HANDLERS ===
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setImagePreview(result);
      const base64 = result.split(',')[1];
      setImageData({ base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyzeImage = async () => {
    if (!imageData) {
      setError('Please select an image first');
      return;
    }

    if (!isOnline) {
      setError('Internet connection required for AI analysis');
      return;
    }

    if (!isGeminiInitialized()) {
      setError('Please add your Gemini API key in Settings');
      return;
    }

    setScannerStep('analyzing');
    setError(null);

    try {
      const result = await analyzeFoodImage(
        imageData.base64,
        imageData.mimeType,
        scannerDescription || undefined,
      );

      setScannerResults(
        result.items.map((item) => ({
          ...item,
          originalPortion: item.portion_grams,
        })),
      );
      setScannerStep('results');
    } catch {
      setError('Failed to analyze image. Please try again.');
      setScannerStep('capture');
    }
  };

  const handlePortionChange = (index: number, newPortion: number) => {
    setScannerResults((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;

        const recalculated = recalculateMacros(
          item.originalPortion,
          newPortion,
          {
            calories:
              item.calories * (item.originalPortion / item.portion_grams),
            protein_g:
              item.protein_g * (item.originalPortion / item.portion_grams),
            carbs_g: item.carbs_g * (item.originalPortion / item.portion_grams),
            fat_g: item.fat_g * (item.originalPortion / item.portion_grams),
          },
        );

        return {
          ...item,
          portion_grams: newPortion,
          calories: recalculated.calories,
          protein_g: recalculated.protein_g,
          carbs_g: recalculated.carbs_g,
          fat_g: recalculated.fat_g,
        };
      }),
    );
  };

  const handleRemoveItem = (index: number) => {
    setScannerResults((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveScannerResults = async () => {
    if (scannerResults.length === 0) {
      setError('No food items to save');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      for (const item of scannerResults) {
        await addEntry({
          date: foodLogModal.date,
          meal_type: scannerMealType,
          food_description: item.name,
          portion_grams: item.portion_grams,
          calories: item.calories,
          protein_g: item.protein_g,
          carbs_g: item.carbs_g,
          fat_g: item.fat_g,
          is_ai_generated: true,
        });
      }

      foodLogModal.onSuccess?.();
      handleClose();
    } catch {
      setError('Failed to save entries');
    } finally {
      setIsSaving(false);
    }
  };

  const totals = scannerResults.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein_g,
      carbs: acc.carbs + item.carbs_g,
      fat: acc.fat + item.fat_g,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  // === RENDER ===
  const renderSelectMode = () => (
    <div className="space-y-3">
      <p className="text-slate-400 text-sm text-center mb-4">
        How would you like to log your meal?
      </p>

      <button
        type="button"
        onClick={() => setFoodLogModalMode('text')}
        disabled={!isOnline}
        className={`w-full flex items-center gap-4 p-4 rounded-lg transition-colors ${
          isOnline
            ? 'bg-slate-700/50 hover:bg-slate-700'
            : 'bg-slate-800/50 opacity-50 cursor-not-allowed'
        }`}
      >
        <div className="w-12 h-12 bg-blue-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
          <FileText size={24} className="text-blue-400" />
        </div>
        <div className="text-left flex-1">
          <p className="text-white font-medium">Log by Text</p>
          <p className="text-slate-400 text-sm">
            {isOnline
              ? 'Describe your meal for AI analysis'
              : 'Requires internet connection'}
          </p>
        </div>
        <ChevronRight size={20} className="text-slate-500" />
      </button>

      <button
        type="button"
        onClick={() => setFoodLogModalMode('scanner')}
        disabled={!isOnline}
        className={`w-full flex items-center gap-4 p-4 rounded-lg transition-colors ${
          isOnline
            ? 'bg-slate-700/50 hover:bg-slate-700'
            : 'bg-slate-800/50 opacity-50 cursor-not-allowed'
        }`}
      >
        <div className="w-12 h-12 bg-purple-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
          <Camera size={24} className="text-purple-400" />
        </div>
        <div className="text-left flex-1">
          <p className="text-white font-medium">Scan Meal</p>
          <p className="text-slate-400 text-sm">
            {isOnline
              ? 'Take a photo for AI analysis'
              : 'Requires internet connection'}
          </p>
        </div>
        <ChevronRight size={20} className="text-slate-500" />
      </button>

      <button
        type="button"
        onClick={() => setFoodLogModalMode('manual')}
        className="w-full flex items-center gap-4 p-4 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
      >
        <div className="w-12 h-12 bg-green-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
          <PenLine size={24} className="text-green-400" />
        </div>
        <div className="text-left flex-1">
          <p className="text-white font-medium">Manual Entry</p>
          <p className="text-slate-400 text-sm">
            Enter macros directly (works offline)
          </p>
        </div>
        <ChevronRight size={20} className="text-slate-500" />
      </button>
    </div>
  );

  const renderTextMode = () => (
    <form onSubmit={handleSubmit(onTextSubmit)} className="space-y-4">
      <button
        type="button"
        onClick={() => setFoodLogModalMode('select')}
        className="flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-2"
      >
        <ChevronLeft size={16} />
        Back
      </button>

      <Select label="Meal Type" options={mealTypes} {...register('mealType')} />

      <TextArea
        label="Describe your food"
        {...register('foodDescription')}
        placeholder="e.g., 2 eggs, 2 slices of toast with butter, orange juice"
        rows={3}
      />

      <Button
        type="button"
        onClick={handleAnalyzeText}
        disabled={isAnalyzing || !foodDescription.trim()}
        className="w-full"
        variant="secondary"
      >
        {isAnalyzing ? (
          <>
            <Loader2 size={16} className="animate-spin mr-2" />
            Analyzing...
          </>
        ) : (
          'Analyze with AI'
        )}
      </Button>

      {calories && (
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-700">
          <Input
            label="Portion (g)"
            type="number"
            {...register('portionGrams')}
            placeholder="100"
          />
          <Input
            label="Calories"
            type="number"
            {...register('calories')}
            error={errors.calories?.message}
          />
          <Input
            label="Protein (g)"
            type="number"
            {...register('protein')}
            error={errors.protein?.message}
          />
          <Input
            label="Carbs (g)"
            type="number"
            {...register('carbs')}
            error={errors.carbs?.message}
          />
          <Input
            label="Fat (g)"
            type="number"
            {...register('fat')}
            error={errors.fat?.message}
          />
        </div>
      )}

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <Button type="submit" disabled={isSaving || !calories} className="w-full">
        {isSaving ? 'Saving...' : 'Save Entry'}
      </Button>
    </form>
  );

  const renderScannerMode = () => {
    if (scannerStep === 'analyzing') {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 size={48} className="text-blue-400 animate-spin mb-4" />
          <p className="text-white font-medium">Analyzing your meal...</p>
          <p className="text-slate-400 text-sm">This may take a few seconds</p>
        </div>
      );
    }

    if (scannerStep === 'results') {
      return (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => {
              setScannerStep('capture');
              setImagePreview(null);
              setImageData(null);
              setScannerResults([]);
            }}
            className="flex items-center gap-1 text-slate-400 hover:text-white text-sm"
          >
            <ChevronLeft size={16} />
            Scan Another
          </button>

          {imagePreview && (
            <img
              src={imagePreview}
              alt="Meal"
              className="w-full h-32 object-cover rounded-lg"
            />
          )}

          <div className="space-y-2">
            {scannerResults.map((item) => (
              <div key={item.name} className="bg-slate-700/50 rounded-lg p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <p className="text-white font-medium text-sm">
                      {item.name}
                    </p>
                    <p className="text-slate-400 text-xs">
                      {Math.round(item.calories)} kcal
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleRemoveItem(scannerResults.indexOf(item))
                    }
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
                        scannerResults.indexOf(item),
                        Math.max(10, item.portion_grams - 10),
                      )
                    }
                    className="p-1 bg-slate-600 rounded hover:bg-slate-500"
                  >
                    <Minus size={14} className="text-white" />
                  </button>
                  <span className="text-white text-sm min-w-[60px] text-center">
                    {item.portion_grams}g
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handlePortionChange(
                        scannerResults.indexOf(item),
                        item.portion_grams + 10,
                      )
                    }
                    className="p-1 bg-slate-600 rounded hover:bg-slate-500"
                  >
                    <Plus size={14} className="text-white" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {scannerResults.length > 0 && (
            <div className="bg-slate-700 rounded-lg p-3">
              <p className="text-slate-400 text-xs mb-2">Total</p>
              <div className="flex justify-between text-sm">
                <span className="text-white font-medium">
                  {Math.round(totals.calories)} kcal
                </span>
                <span className="text-slate-400">
                  P: {Math.round(totals.protein)}g | C:{' '}
                  {Math.round(totals.carbs)}g | F: {Math.round(totals.fat)}g
                </span>
              </div>
            </div>
          )}

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <Button
            onClick={handleSaveScannerResults}
            disabled={isSaving || scannerResults.length === 0}
            className="w-full"
          >
            {isSaving
              ? 'Saving...'
              : `Save ${scannerResults.length} Item${scannerResults.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      );
    }

    // Capture step
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setFoodLogModalMode('select')}
          className="flex items-center gap-1 text-slate-400 hover:text-white text-sm"
        >
          <ChevronLeft size={16} />
          Back
        </button>

        <Select
          label="Meal Type"
          options={mealTypes}
          value={scannerMealType}
          onChange={(e) => setScannerMealType(e.target.value as MealType)}
        />

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/*"
          capture="environment"
          className="hidden"
        />

        {imagePreview ? (
          <div className="relative">
            <img
              src={imagePreview}
              alt="Preview"
              className="w-full h-48 object-cover rounded-lg"
            />
            <button
              type="button"
              onClick={() => {
                setImagePreview(null);
                setImageData(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="absolute top-2 right-2 p-1 bg-black/50 rounded-full hover:bg-black/70"
            >
              <X size={16} className="text-white" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-48 border-2 border-dashed border-slate-600 rounded-lg flex flex-col items-center justify-center gap-2 hover:border-slate-500 transition-colors"
          >
            <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center">
              <Camera size={24} className="text-slate-400" />
            </div>
            <p className="text-slate-400 text-sm">
              Tap to take or upload photo
            </p>
          </button>
        )}

        <TextArea
          label="Additional context (optional)"
          value={scannerDescription}
          onChange={(e) => setScannerDescription(e.target.value)}
          placeholder="e.g., homemade, extra cheese, small portion"
          rows={2}
        />

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <Button
          onClick={handleAnalyzeImage}
          disabled={!imageData}
          className="w-full"
        >
          Analyze Meal
        </Button>
      </div>
    );
  };

  const renderManualMode = () => (
    <form onSubmit={handleSubmit(onTextSubmit)} className="space-y-4">
      <button
        type="button"
        onClick={() => setFoodLogModalMode('select')}
        className="flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-2"
      >
        <ChevronLeft size={16} />
        Back
      </button>

      <Select label="Meal Type" options={mealTypes} {...register('mealType')} />

      <TextArea
        label="Food Description"
        {...register('foodDescription')}
        placeholder="e.g., grilled chicken breast with rice"
        rows={2}
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Portion (g)"
          type="number"
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

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <Button type="submit" disabled={isSaving || !calories} className="w-full">
        {isSaving ? 'Saving...' : 'Save Entry'}
      </Button>
    </form>
  );

  const getTitle = () => {
    const dateStr = formatDisplayDate(foodLogModal.date);
    switch (foodLogModal.mode) {
      case 'text':
        return `Log Food - ${dateStr}`;
      case 'scanner':
        return `Scan Meal - ${dateStr}`;
      case 'manual':
        return `Manual Entry - ${dateStr}`;
      default:
        return `Log Food - ${dateStr}`;
    }
  };

  return (
    <Modal
      isOpen={foodLogModal.isOpen}
      onClose={handleClose}
      title={getTitle()}
      size={
        foodLogModal.mode === 'scanner' && scannerStep === 'results'
          ? 'md'
          : 'sm'
      }
    >
      {foodLogModal.mode === 'select' && renderSelectMode()}
      {foodLogModal.mode === 'text' && renderTextMode()}
      {foodLogModal.mode === 'scanner' && renderScannerMode()}
      {foodLogModal.mode === 'manual' && renderManualMode()}
    </Modal>
  );
}
