import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Utensils, Camera, Scale, Dumbbell } from 'lucide-react';
import { Card, CardContent } from '../components/ui';
import {
  WeeklyReviewButton,
  WeeklyReviewModal,
} from '../components/weekly-review';
import { useProfile } from '../hooks/useProfile';
import { useCalories } from '../hooks/useCalories';
import { useWeight } from '../hooks/useWeight';
import { useAppStore } from '../hooks/useAppStore';
import { formatDate, formatDisplayDate } from '../utils/date';
import { formatCalories, calculateProgress } from '../utils/calculations';

export function Dashboard() {
  const { profile, fetchProfile } = useProfile();
  const { fetchEntriesByDate, getDailySummary } = useCalories();
  const { getLatestLog } = useWeight();
  const isOnline = useAppStore((state) => state.isOnline);

  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [showWeeklyReview, setShowWeeklyReview] = useState(false);
  const today = formatDate(new Date());

  useEffect(() => {
    fetchProfile();
    fetchEntriesByDate(today);
    getLatestLog().then((log) => {
      if (log) setLatestWeight(log.weight_kg);
    });
  }, [fetchProfile, fetchEntriesByDate, getLatestLog, today]);

  const summary = getDailySummary(today);
  const caloriesConsumed = summary.total_calories;
  const calorieTarget = profile?.calorie_target || 2000;
  const caloriesRemaining = calorieTarget - caloriesConsumed;
  const progress = calculateProgress(caloriesConsumed, calorieTarget);

  return (
    <div className="p-4 pb-20 space-y-4">
      {/* Date Header */}
      <div className="text-center mb-6">
        <p className="text-slate-400 text-sm">Today</p>
        <h2 className="text-xl font-semibold text-white">
          {formatDisplayDate(today)}
        </h2>
      </div>

      {/* Weekly Review Button - Shows on Mondays with at least 5 logged days */}
      <WeeklyReviewButton
        profile={profile}
        onStartReview={() => setShowWeeklyReview(true)}
      />

      {/* Weekly Review Modal */}
      {profile && (
        <WeeklyReviewModal
          isOpen={showWeeklyReview}
          onClose={() => setShowWeeklyReview(false)}
          profile={profile}
        />
      )}

      {/* Calorie Summary Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Calories</h3>
            <Link
              to="/calories"
              className="text-blue-400 text-sm hover:underline"
            >
              View Details
            </Link>
          </div>

          {/* Progress Ring */}
          <div className="flex items-center justify-center mb-6">
            <div className="relative w-40 h-40">
              <svg
                className="w-full h-full transform -rotate-90"
                aria-label="Calorie progress indicator"
                role="img"
              >
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  fill="none"
                  stroke="#334155"
                  strokeWidth="12"
                />
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  fill="none"
                  stroke={progress > 100 ? '#ef4444' : '#3b82f6'}
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.min(progress, 100) * 4.4} 440`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-white">
                  {formatCalories(caloriesRemaining)}
                </span>
                <span className="text-slate-400 text-sm">remaining</span>
              </div>
            </div>
          </div>

          {/* Macro Summary */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-semibold text-white">
                {formatCalories(caloriesConsumed)}
              </p>
              <p className="text-slate-400 text-xs">Consumed</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">
                {formatCalories(calorieTarget)}
              </p>
              <p className="text-slate-400 text-xs">Target</p>
            </div>
            <div>
              <p
                className={`text-2xl font-semibold ${caloriesRemaining < 0 ? 'text-red-400' : 'text-green-400'}`}
              >
                {formatCalories(Math.abs(caloriesRemaining))}
              </p>
              <p className="text-slate-400 text-xs">
                {caloriesRemaining < 0 ? 'Over' : 'Left'}
              </p>
            </div>
          </div>

          {/* Macros Bar */}
          <div className="mt-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Protein</span>
              <span className="text-white">
                {summary.total_protein_g.toFixed(0)}g /{' '}
                {profile?.protein_target_g || 0}g
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Carbs</span>
              <span className="text-white">
                {summary.total_carbs_g.toFixed(0)}g /{' '}
                {profile?.carbs_target_g || 0}g
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Fat</span>
              <span className="text-white">
                {summary.total_fat_g.toFixed(0)}g / {profile?.fat_target_g || 0}
                g
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/calories?action=add">
          <Card className="hover:bg-slate-700 transition-colors">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
                <Plus size={20} className="text-blue-400" />
              </div>
              <div>
                <p className="text-white font-medium">Log Food</p>
                <p className="text-slate-400 text-xs">Add meal entry</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/scanner">
          <Card
            className={`transition-colors ${isOnline ? 'hover:bg-slate-700' : 'opacity-50'}`}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-600/20 rounded-lg flex items-center justify-center">
                <Camera size={20} className="text-purple-400" />
              </div>
              <div>
                <p className="text-white font-medium">Scan Meal</p>
                <p className="text-slate-400 text-xs">
                  {isOnline ? 'AI analysis' : 'Requires internet'}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/weight?action=add">
          <Card className="hover:bg-slate-700 transition-colors">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-green-600/20 rounded-lg flex items-center justify-center">
                <Scale size={20} className="text-green-400" />
              </div>
              <div>
                <p className="text-white font-medium">Log Weight</p>
                <p className="text-slate-400 text-xs">
                  {latestWeight ? `${latestWeight} kg` : 'Track progress'}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/workout">
          <Card className="hover:bg-slate-700 transition-colors">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-600/20 rounded-lg flex items-center justify-center">
                <Dumbbell size={20} className="text-orange-400" />
              </div>
              <div>
                <p className="text-white font-medium">Workout</p>
                <p className="text-slate-400 text-xs">Start session</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Today's Meals Summary */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-lg font-semibold text-white mb-4">
            Today's Meals
          </h3>
          {Object.entries(summary.meals).map(([mealType, mealEntries]) => {
            const mealCalories = mealEntries.reduce(
              (sum, e) => sum + e.calories,
              0,
            );
            return (
              <div
                key={mealType}
                className="flex justify-between items-center py-2 border-b border-slate-700 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <Utensils size={16} className="text-slate-400" />
                  <span className="text-white capitalize">{mealType}</span>
                  {mealEntries.length > 0 && (
                    <span className="text-slate-500 text-sm">
                      ({mealEntries.length} items)
                    </span>
                  )}
                </div>
                <span className="text-slate-300">{mealCalories} kcal</span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
