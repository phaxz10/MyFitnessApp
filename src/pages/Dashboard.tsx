import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Utensils,
  Camera,
  Scale,
  Dumbbell,
  TrendingUp,
  Trophy,
  Play,
} from 'lucide-react';
import { Card, CardContent, Button, DashboardSkeleton } from '../components/ui';
import {
  WeeklyReviewButton,
  WeeklyReviewModal,
} from '../components/weekly-review';
import { useProfile } from '../hooks/useProfile';
import { useCalories } from '../hooks/useCalories';
import { useWeight } from '../hooks/useWeight';
import { useWorkoutLogs } from '../hooks/useWorkoutLogs';
import { useExerciseProgress } from '../hooks/useExerciseProgress';
import { useAppStore } from '../hooks/useAppStore';
import { formatDate, formatDisplayDate } from '../utils/date';
import { formatCalories, calculateProgress } from '../utils/calculations';

export function Dashboard() {
  const navigate = useNavigate();
  const { profile, fetchProfile } = useProfile();
  const { fetchEntriesByDate, getDailySummary } = useCalories();
  const { getLatestLog } = useWeight();
  const { logs, fetchLogs, activeWorkout, resumeWorkout, startWorkout } =
    useWorkoutLogs();
  const { getOverallProgress } = useExerciseProgress();
  const isOnline = useAppStore((state) => state.isOnline);

  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [showWeeklyReview, setShowWeeklyReview] = useState(false);
  const [weeklyWorkouts, setWeeklyWorkouts] = useState(0);
  const [recentPRsCount, setRecentPRsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const today = formatDate(new Date());

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          fetchProfile(),
          fetchEntriesByDate(today),
          fetchLogs(5),
          resumeWorkout(),
        ]);

        const [weightLog, progressData] = await Promise.all([
          getLatestLog(),
          getOverallProgress('7d'),
        ]);

        if (weightLog) setLatestWeight(weightLog.weight_kg);
        setWeeklyWorkouts(progressData.totalWorkouts);
        setRecentPRsCount(progressData.recentPRs.length);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [
    fetchProfile,
    fetchEntriesByDate,
    fetchLogs,
    resumeWorkout,
    getLatestLog,
    getOverallProgress,
    today,
  ]);

  const summary = getDailySummary(today);
  const caloriesConsumed = summary.total_calories;
  const calorieTarget = profile?.calorie_target || 2000;
  const caloriesRemaining = calorieTarget - caloriesConsumed;
  const progress = calculateProgress(caloriesConsumed, calorieTarget);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

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

      {/* Workout Summary Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Dumbbell size={18} className="text-orange-400" />
              Workouts
            </h3>
            <Link
              to="/workout/progress"
              className="text-blue-400 text-sm flex items-center gap-1"
            >
              <TrendingUp size={14} />
              Progress
            </Link>
          </div>

          {activeWorkout ? (
            <div className="bg-blue-600/20 border border-blue-500/30 rounded-lg p-3 mb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                  <span className="text-blue-400 font-medium">
                    Workout in Progress
                  </span>
                </div>
                <Button
                  onClick={() => navigate('/workout/session')}
                  className="py-1 px-3 text-sm"
                >
                  Resume
                </Button>
              </div>
            </div>
          ) : (
            <Button
              className="w-full mb-3"
              onClick={async () => {
                await startWorkout();
                navigate('/workout/session');
              }}
            >
              <Play size={16} className="mr-2" />
              Start Workout
            </Button>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-700/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-white">{weeklyWorkouts}</p>
              <p className="text-slate-400 text-xs">This Week</p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-3 text-center">
              <div className="flex items-center justify-center gap-1">
                <Trophy
                  size={16}
                  className={
                    recentPRsCount > 0 ? 'text-yellow-400' : 'text-slate-500'
                  }
                />
                <p className="text-2xl font-bold text-white">
                  {recentPRsCount}
                </p>
              </div>
              <p className="text-slate-400 text-xs">Recent PRs</p>
            </div>
          </div>

          {logs.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-700">
              <p className="text-slate-400 text-xs mb-2">Last workout</p>
              <p className="text-white text-sm">
                {logs[0].session_name || 'Quick Workout'} -{' '}
                {logs[0].sets?.length || 0} sets
              </p>
            </div>
          )}
        </CardContent>
      </Card>

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
