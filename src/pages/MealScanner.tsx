import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Upload, X, Plus, Minus } from 'lucide-react';
import {
  Card,
  CardContent,
  Button,
  Input,
  Select,
  TextArea,
} from '../components/ui';
import { useCalories } from '../hooks/useCalories';
import { useProfile } from '../hooks/useProfile';
import { useAppStore } from '../hooks/useAppStore';
import { analyzeFoodImage } from '../services/gemini';
import { formatDate } from '../utils/date';
import { recalculateMacros } from '../utils/calculations';
import type { MealType, AIFoodItem } from '../types';

const mealTypes: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

interface EditableFoodItem extends AIFoodItem {
  originalPortion: number;
}

export function MealScanner() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { addEntry } = useCalories();
  const isOnline = useAppStore((state) => state.isOnline);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'capture' | 'analyzing' | 'results'>(
    'capture',
  );
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [description, setDescription] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{
    base64: string;
    mimeType: string;
  } | null>(null);
  const [results, setResults] = useState<EditableFoodItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setImagePreview(result);

      // Extract base64 data
      const base64 = result.split(',')[1];
      setImageData({ base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  const handleCapture = () => {
    fileInputRef.current?.click();
  };

  const handleAnalyze = async () => {
    if (!imageData) {
      setError('Please select an image first');
      return;
    }

    if (!isOnline) {
      setError('Internet connection required for AI analysis');
      return;
    }

    if (!profile?.gemini_api_key) {
      setError('Please add your Gemini API key in Settings');
      return;
    }

    setStep('analyzing');
    setIsLoading(true);
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
      setError('Failed to analyze image. Please try again or enter manually.');
      setStep('capture');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePortionChange = (index: number, newPortion: number) => {
    setResults((prev) =>
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
    setResults((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (results.length === 0) {
      setError('No food items to save');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      for (const item of results) {
        await addEntry({
          date: formatDate(new Date()),
          meal_type: mealType,
          food_description: item.name,
          portion_grams: item.portion_grams,
          calories: item.calories,
          protein_g: item.protein_g,
          carbs_g: item.carbs_g,
          fat_g: item.fat_g,
          is_ai_generated: true,
        });
      }

      navigate('/calories');
    } catch (err) {
      setError('Failed to save entries');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setStep('capture');
    setImagePreview(null);
    setImageData(null);
    setResults([]);
    setDescription('');
    setError(null);
  };

  const totalCalories = results.reduce((sum, item) => sum + item.calories, 0);
  const totalProtein = results.reduce((sum, item) => sum + item.protein_g, 0);
  const totalCarbs = results.reduce((sum, item) => sum + item.carbs_g, 0);
  const totalFat = results.reduce((sum, item) => sum + item.fat_g, 0);

  if (!isOnline) {
    return (
      <div className="p-4 pb-20">
        <h1 className="text-2xl font-bold text-white mb-6">Meal Scanner</h1>
        <Card>
          <CardContent className="p-6 text-center">
            <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Camera size={32} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              Offline Mode
            </h3>
            <p className="text-slate-400 text-sm mb-4">
              Meal scanner requires an internet connection for AI analysis.
            </p>
            <Button
              variant="secondary"
              onClick={() => navigate('/calories?action=add')}
            >
              Add Food Manually
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 pb-20">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Meal Scanner</h1>
        {step !== 'capture' && (
          <Button variant="ghost" onClick={handleReset}>
            <X size={18} className="mr-1" />
            Reset
          </Button>
        )}
      </div>

      {error && (
        <div className="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Capture Step */}
      {step === 'capture' && (
        <div className="space-y-4">
          <Select
            label="Meal Type"
            value={mealType}
            onChange={(e) => setMealType(e.target.value as MealType)}
            options={mealTypes}
          />

          <Card>
            <CardContent className="p-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
              />

              {imagePreview ? (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="Food preview"
                    className="w-full h-64 object-cover rounded-lg"
                  />
                  <button
                    onClick={() => {
                      setImagePreview(null);
                      setImageData(null);
                    }}
                    className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white hover:bg-black/70"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div
                  onClick={handleCapture}
                  className="h-64 border-2 border-dashed border-slate-600 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-slate-500 transition-colors"
                >
                  <Camera size={48} className="text-slate-500 mb-4" />
                  <p className="text-slate-400">Tap to capture or upload</p>
                  <p className="text-slate-500 text-sm">JPG, PNG supported</p>
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <Button
                  variant="secondary"
                  onClick={handleCapture}
                  className="flex-1"
                >
                  <Camera size={18} className="mr-2" />
                  Camera
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (e) => handleFileSelect(e as any);
                    input.click();
                  }}
                  className="flex-1"
                >
                  <Upload size={18} className="mr-2" />
                  Gallery
                </Button>
              </div>
            </CardContent>
          </Card>

          <TextArea
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., Filipino chicken adobo with rice"
            rows={2}
            helperText="Adding details helps improve accuracy"
          />

          <Button
            onClick={handleAnalyze}
            disabled={!imageData}
            className="w-full"
          >
            Analyze Food
          </Button>
        </div>
      )}

      {/* Analyzing Step */}
      {step === 'analyzing' && (
        <div className="text-center py-12">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
          <h2 className="text-xl font-semibold text-white mb-2">
            Analyzing...
          </h2>
          <p className="text-slate-400">AI is identifying your food</p>
        </div>
      )}

      {/* Results Step */}
      {step === 'results' && (
        <div className="space-y-4">
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Analyzed food"
              className="w-full h-40 object-cover rounded-lg"
            />
          )}

          <Card>
            <CardContent className="p-4">
              <h3 className="text-lg font-semibold text-white mb-4">
                Identified Items
              </h3>

              {results.length === 0 ? (
                <p className="text-slate-400 text-center py-4">
                  No items identified
                </p>
              ) : (
                <div className="space-y-4">
                  {results.map((item, index) => (
                    <div key={index} className="bg-slate-700/30 rounded-lg p-3">
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-white font-medium">{item.name}</p>
                        <button
                          onClick={() => handleRemoveItem(index)}
                          className="text-slate-400 hover:text-red-400"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <div className="flex items-center gap-2 mb-2">
                        <button
                          onClick={() =>
                            handlePortionChange(
                              index,
                              Math.max(10, item.portion_grams - 10),
                            )
                          }
                          className="p-1 bg-slate-600 rounded hover:bg-slate-500"
                        >
                          <Minus size={14} />
                        </button>
                        <Input
                          type="number"
                          value={item.portion_grams}
                          onChange={(e) =>
                            handlePortionChange(
                              index,
                              parseInt(e.target.value) || 0,
                            )
                          }
                          className="w-20 text-center"
                        />
                        <span className="text-slate-400 text-sm">g</span>
                        <button
                          onClick={() =>
                            handlePortionChange(index, item.portion_grams + 10)
                          }
                          className="p-1 bg-slate-600 rounded hover:bg-slate-500"
                        >
                          <Plus size={14} />
                        </button>
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-xs text-center">
                        <div className="bg-slate-700 rounded p-1">
                          <p className="text-white font-semibold">
                            {item.calories}
                          </p>
                          <p className="text-slate-400">kcal</p>
                        </div>
                        <div className="bg-slate-700 rounded p-1">
                          <p className="text-blue-400 font-semibold">
                            {item.protein_g.toFixed(1)}
                          </p>
                          <p className="text-slate-400">P</p>
                        </div>
                        <div className="bg-slate-700 rounded p-1">
                          <p className="text-green-400 font-semibold">
                            {item.carbs_g.toFixed(1)}
                          </p>
                          <p className="text-slate-400">C</p>
                        </div>
                        <div className="bg-slate-700 rounded p-1">
                          <p className="text-yellow-400 font-semibold">
                            {item.fat_g.toFixed(1)}
                          </p>
                          <p className="text-slate-400">F</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Total */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-lg font-semibold text-white mb-3">Total</h3>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-2xl font-bold text-white">
                    {totalCalories}
                  </p>
                  <p className="text-slate-400 text-xs">kcal</p>
                </div>
                <div>
                  <p className="text-xl font-semibold text-blue-400">
                    {totalProtein.toFixed(1)}g
                  </p>
                  <p className="text-slate-400 text-xs">Protein</p>
                </div>
                <div>
                  <p className="text-xl font-semibold text-green-400">
                    {totalCarbs.toFixed(1)}g
                  </p>
                  <p className="text-slate-400 text-xs">Carbs</p>
                </div>
                <div>
                  <p className="text-xl font-semibold text-yellow-400">
                    {totalFat.toFixed(1)}g
                  </p>
                  <p className="text-slate-400 text-xs">Fat</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={handleReset}
              className="flex-1"
            >
              Retake
            </Button>
            <Button
              onClick={handleSave}
              isLoading={isLoading}
              className="flex-1"
            >
              Save to {mealType}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
