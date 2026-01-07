import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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

  // Form state
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [foodDescription, setFoodDescription] = useState('');
  const [portionGrams, setPortionGrams] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [useAI, setUseAI] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    fetchEntriesByDate(currentDate);
  }, [currentDate, fetchEntriesByDate]);

  useEffect(() => {
    if (searchParams.get('action') === 'add') {
      openAddModal();
    }
  }, [searchParams]);

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

  const openAddModal = () => {
    setIsEditMode(false);
    setEditingEntry(null);
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (entry: FoodEntry) => {
    setIsEditMode(true);
    setEditingEntry(entry);
    setMealType(entry.meal_type);
    setFoodDescription(entry.food_description);
    setPortionGrams(entry.portion_grams.toString());
    setCalories(entry.calories.toString());
    setProtein(entry.protein_g.toString());
    setCarbs(entry.carbs_g.toString());
    setFat(entry.fat_g.toString());
    setUseAI(false);
    setIsModalOpen(true);
  };

  const resetForm = () => {
    setMealType('breakfast');
    setFoodDescription('');
    setPortionGrams('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    setUseAI(true);
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
        setPortionGrams(totalPortion.toString());
        setCalories(total.calories.toString());
        setProtein(total.protein_g.toString());
        setCarbs(total.carbs_g.toString());
        setFat(total.fat_g.toString());
      }
    } catch (err) {
      setError('Failed to analyze food. Please enter values manually.');
      setUseAI(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!foodDescription.trim()) {
      setError('Please enter a food description');
      return;
    }

    if (!calories || !protein || !carbs || !fat) {
      setError('Please fill in all nutritional values');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (isEditMode && editingEntry) {
        await updateEntry(editingEntry.id, {
          meal_type: mealType,
          food_description: foodDescription,
          portion_grams: parseFloat(portionGrams) || 0,
          calories: parseInt(calories),
          protein_g: parseFloat(protein),
          carbs_g: parseFloat(carbs),
          fat_g: parseFloat(fat),
        });
        await fetchEntriesByDate(currentDate);
      } else {
        await addEntry({
          date: currentDate,
          meal_type: mealType,
          food_description: foodDescription,
          portion_grams: parseFloat(portionGrams) || 0,
          calories: parseInt(calories),
          protein_g: parseFloat(protein),
          carbs_g: parseFloat(carbs),
          fat_g: parseFloat(fat),
          is_ai_generated: useAI,
        });
      }
      setIsModalOpen(false);
      resetForm();
    } catch (err) {
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

  return (
    <div className="p-4 pb-20">
      {/* Date Navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
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
                          onClick={() => openEditModal(entry)}
                          className="p-2 text-slate-400 hover:text-blue-400"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
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
                onClick={() => {
                  setMealType(value);
                  openAddModal();
                }}
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
        onClose={() => setIsModalOpen(false)}
        title={isEditMode ? 'Edit Entry' : 'Add Food Entry'}
        size="lg"
      >
        <div className="space-y-4">
          <Select
            label="Meal Type"
            value={mealType}
            onChange={(e) => setMealType(e.target.value as MealType)}
            options={mealTypes}
          />

          <TextArea
            label="Food Description"
            value={foodDescription}
            onChange={(e) => setFoodDescription(e.target.value)}
            placeholder="e.g., 50g cooked rice, 100g pork adobo"
            rows={3}
          />

          {!isEditMode && isOnline && profile?.gemini_api_key && (
            <div className="flex gap-2">
              <Button
                onClick={handleAnalyzeWithAI}
                isLoading={isLoading}
                disabled={!foodDescription.trim()}
                className="flex-1"
              >
                Analyze with AI
              </Button>
              <Button variant="secondary" onClick={() => setUseAI(false)}>
                Manual
              </Button>
            </div>
          )}

          {(!useAI || !isOnline || !profile?.gemini_api_key || calories) && (
            <>
              <Input
                label="Portion (grams)"
                type="number"
                value={portionGrams}
                onChange={(e) => setPortionGrams(e.target.value)}
                placeholder="Optional"
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Calories"
                  type="number"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  placeholder="kcal"
                />
                <Input
                  label="Protein (g)"
                  type="number"
                  step="0.1"
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                  placeholder="grams"
                />
                <Input
                  label="Carbs (g)"
                  type="number"
                  step="0.1"
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                  placeholder="grams"
                />
                <Input
                  label="Fat (g)"
                  type="number"
                  step="0.1"
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                  placeholder="grams"
                />
              </div>
            </>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-2 pt-4">
            <Button
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              isLoading={isLoading}
              className="flex-1"
            >
              {isEditMode ? 'Update' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
