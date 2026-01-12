import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Utensils,
  Camera,
  Scale,
  Dumbbell,
  TrendingUp,
  TrendingDown,
  Trophy,
  FileText,
  ChevronRight,
  Flame,
  Target,
} from 'lucide-react';
import {
  Card,
  CardContent,
  Button,
  Modal,
  DashboardSkeleton,
} from '../components/ui';
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
  const { fetchEntriesByDate, getDailySummary, getLoggingStreak } =
    useCalories();
  const { getLatestLog, getFirstWeight } = useWeight();
  const { logs, fetchLogs, activeWorkout, resumeWorkout } = useWorkoutLogs();
  const { getOverallProgress } = useExerciseProgress();
  const isOnline = useAppStore((state) => state.isOnline);

  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [showWeeklyReview, setShowWeeklyReview] = useState(false);
  const [showFoodLogOptions, setShowFoodLogOptions] = useState(false);
  const [weeklyWorkouts, setWeeklyWorkouts] = useState(0);
  const [recentPRsCount, setRecentPRsCount] = useState(0);
  const [loggingStreak, setLoggingStreak] = useState(0);
  const [startWeight, setStartWeight] = useState<number | null>(null);
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

        const [weightLog, progressData, streak, firstWeight] =
          await Promise.all([
            getLatestLog(),
            getOverallProgress('7d'),
            getLoggingStreak(),
            getFirstWeight(),
          ]);

        if (weightLog) setLatestWeight(weightLog.weight_kg);
        setWeeklyWorkouts(progressData.totalWorkouts);
        setRecentPRsCount(progressData.recentPRs.length);
        setLoggingStreak(streak);
        setStartWeight(firstWeight);
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
    getLoggingStreak,
    getFirstWeight,
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
        {loggingStreak > 0 && (
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <Flame
              size={16}
              className={
                loggingStreak >= 7 ? 'text-orange-400' : 'text-slate-400'
              }
            />
            <span
              className={`text-sm font-medium ${loggingStreak >= 7 ? 'text-orange-400' : 'text-slate-400'}`}
            >
              {loggingStreak} day{loggingStreak !== 1 ? 's' : ''} streak
            </span>
          </div>
        )}
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

          {/* Macros Progress Bars */}
          <div className="mt-6 space-y-3">
            {/* Protein */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-blue-400 font-medium">Protein</span>
                <span className="text-white">
                  {summary.total_protein_g.toFixed(0)}g /{' '}
                  {profile?.protein_target_g || 0}g
                </span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    summary.total_protein_g > (profile?.protein_target_g || 0)
                      ? 'bg-red-500'
                      : 'bg-blue-500'
                  }`}
                  style={{
                    width: `${Math.min(
                      (summary.total_protein_g /
                        (profile?.protein_target_g || 1)) *
                        100,
                      100,
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* Carbs */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-green-400 font-medium">Carbs</span>
                <span className="text-white">
                  {summary.total_carbs_g.toFixed(0)}g /{' '}
                  {profile?.carbs_target_g || 0}g
                </span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    summary.total_carbs_g > (profile?.carbs_target_g || 0)
                      ? 'bg-red-500'
                      : 'bg-green-500'
                  }`}
                  style={{
                    width: `${Math.min(
                      (summary.total_carbs_g / (profile?.carbs_target_g || 1)) *
                        100,
                      100,
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* Fat */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-yellow-400 font-medium">Fat</span>
                <span className="text-white">
                  {summary.total_fat_g.toFixed(0)}g /{' '}
                  {profile?.fat_target_g || 0}g
                </span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    summary.total_fat_g > (profile?.fat_target_g || 0)
                      ? 'bg-red-500'
                      : 'bg-yellow-500'
                  }`}
                  style={{
                    width: `${Math.min(
                      (summary.total_fat_g / (profile?.fat_target_g || 1)) *
                        100,
                      100,
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => setShowFoodLogOptions(true)}
          className="w-full"
        >
          <Card className="hover:bg-slate-700 transition-colors h-full">
            <CardContent className="p-4 flex flex-col items-center gap-2">
              <div className="w-12 h-12 bg-blue-600/20 rounded-lg flex items-center justify-center">
                <Utensils size={24} className="text-blue-400" />
              </div>
              <p className="text-white font-medium text-sm">Log Food</p>
            </CardContent>
          </Card>
        </button>

        <Link to="/weight?action=add">
          <Card className="hover:bg-slate-700 transition-colors h-full">
            <CardContent className="p-4 flex flex-col items-center gap-2">
              <div className="w-12 h-12 bg-green-600/20 rounded-lg flex items-center justify-center">
                <Scale size={24} className="text-green-400" />
              </div>
              <p className="text-white font-medium text-sm">Log Weight</p>
              {latestWeight && (
                <p className="text-slate-400 text-xs">{latestWeight} kg</p>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link to="/workout">
          <Card className="hover:bg-slate-700 transition-colors h-full">
            <CardContent className="p-4 flex flex-col items-center gap-2">
              <div className="w-12 h-12 bg-orange-600/20 rounded-lg flex items-center justify-center">
                <Dumbbell size={24} className="text-orange-400" />
              </div>
              <p className="text-white font-medium text-sm">Workout</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Food Log Options Modal */}
      <Modal
        isOpen={showFoodLogOptions}
        onClose={() => setShowFoodLogOptions(false)}
        title="Log Food"
        size="sm"
      >
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              setShowFoodLogOptions(false);
              navigate('/calories?action=add');
            }}
            className="w-full flex items-center gap-4 p-4 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <div className="w-12 h-12 bg-blue-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <FileText size={24} className="text-blue-400" />
            </div>
            <div className="text-left flex-1">
              <p className="text-white font-medium">Log by Text</p>
              <p className="text-slate-400 text-sm">
                Describe your meal for AI analysis
              </p>
            </div>
            <ChevronRight size={20} className="text-slate-500" />
          </button>

          <button
            type="button"
            onClick={() => {
              setShowFoodLogOptions(false);
              navigate('/scanner');
            }}
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
        </div>
      </Modal>

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
          ) : null}

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

      {/* Goal Progress Card */}
      {profile && startWeight && latestWeight && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Target size={18} className="text-purple-400" />
                Goal Progress
              </h3>
              <span className="text-xs px-2 py-1 bg-slate-700 rounded-full text-slate-300 capitalize">
                {profile.goal.replace('_', ' ')}
              </span>
            </div>

            {(() => {
              const totalChange = latestWeight - startWeight;
              const isLosingGoal = profile.goal === 'cut';
              const isGainingGoal =
                profile.goal === 'bulk' || profile.goal === 'lean_bulk';
              const isOnTrack = isLosingGoal
                ? totalChange <= 0
                : isGainingGoal
                  ? totalChange >= 0
                  : true;

              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-center flex-1">
                      <p className="text-slate-400 text-xs">Start</p>
                      <p className="text-lg font-semibold text-white">
                        {startWeight.toFixed(1)} kg
                      </p>
                    </div>
                    <div className="flex-1 flex justify-center">
                      {totalChange !== 0 && (
                        <div
                          className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm ${
                            isOnTrack
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {totalChange < 0 ? (
                            <TrendingDown size={14} />
                          ) : (
                            <TrendingUp size={14} />
                          )}
                          <span>
                            {totalChange > 0 ? '+' : ''}
                            {totalChange.toFixed(1)} kg
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="text-center flex-1">
                      <p className="text-slate-400 text-xs">Current</p>
                      <p className="text-lg font-semibold text-white">
                        {latestWeight.toFixed(1)} kg
                      </p>
                    </div>
                  </div>

                  {profile.target_rate_kg_per_week > 0 && (
                    <div className="text-center pt-2 border-t border-slate-700">
                      <p className="text-slate-400 text-xs">
                        Target: {isLosingGoal ? '-' : '+'}
                        {profile.target_rate_kg_per_week} kg/week
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Today's Meals Summary */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white">Today's Meals</h3>
            <Link
              to="/calories"
              className="text-blue-400 text-sm hover:underline"
            >
              View all
            </Link>
          </div>
          {(() => {
            const mealsWithEntries = Object.entries(summary.meals).filter(
              ([, entries]) => entries.length > 0,
            );

            if (mealsWithEntries.length === 0) {
              return (
                <p className="text-slate-500 text-sm text-center py-4">
                  No meals logged yet today
                </p>
              );
            }

            return mealsWithEntries.map(([mealType, mealEntries]) => {
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
                    <span className="text-slate-500 text-sm">
                      ({mealEntries.length}{' '}
                      {mealEntries.length === 1 ? 'item' : 'items'})
                    </span>
                  </div>
                  <span className="text-slate-300">{mealCalories} kcal</span>
                </div>
              );
            });
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
