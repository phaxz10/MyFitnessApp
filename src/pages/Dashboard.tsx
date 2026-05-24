import {
  ChevronRight,
  Dumbbell,
  Scale,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Utensils,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MACRO_PALETTE, NutritionRings } from '../components/nutrition';
import {
  Button,
  Card,
  CardContent,
  DashboardSkeleton,
  Modal,
} from '../components/ui';
import {
  WeeklyReviewButton,
  WeeklyReviewModal,
} from '../components/weekly-review';
import { useAppStore } from '../hooks/useAppStore';
import { useCalories } from '../hooks/useCalories';
import { useExerciseProgress } from '../hooks/useExerciseProgress';
import { useProfile } from '../hooks/useProfile';
import {
  type DayConsistency,
  useWeeklyConsistency,
} from '../hooks/useWeeklyConsistency';
import { useWeight } from '../hooks/useWeight';
import { useWorkoutLogs } from '../hooks/useWorkoutLogs';
import { formatCalories } from '../utils/calculations';
import { formatDate, formatDisplayDate } from '../utils/date';

export function Dashboard() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { fetchEntriesByDate, getDailySummary } = useCalories();
  const { getLatestLog, getFirstWeight } = useWeight();
  const { logs, fetchLogs, activeWorkout, resumeWorkout } = useWorkoutLogs();
  const { getOverallProgress } = useExerciseProgress();
  const { getWeeklyConsistency } = useWeeklyConsistency();
  const { openFoodLogModal, openWeightLogModal } = useAppStore();

  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [showWeeklyReview, setShowWeeklyReview] = useState(false);
  const [weeklyWorkouts, setWeeklyWorkouts] = useState(0);
  const [recentPRsCount, setRecentPRsCount] = useState(0);
  const [weeklyConsistency, setWeeklyConsistency] = useState<DayConsistency[]>(
    [],
  );
  const [startWeight, setStartWeight] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<DayConsistency | null>(null);
  const today = formatDate(new Date());

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        fetchEntriesByDate(today),
        fetchLogs(5),
        resumeWorkout(),
      ]);

      const [weightLog, progressData, consistency, firstWeight] =
        await Promise.all([
          getLatestLog(),
          getOverallProgress('7d'),
          getWeeklyConsistency(),
          getFirstWeight(),
        ]);

      if (weightLog) setLatestWeight(weightLog.weight_kg);
      setWeeklyWorkouts(progressData.totalWorkouts);
      setRecentPRsCount(progressData.recentPRs.length);
      setWeeklyConsistency(consistency.days);
      setStartWeight(firstWeight);
    } finally {
      setIsLoading(false);
    }
  }, [
    fetchEntriesByDate,
    fetchLogs,
    resumeWorkout,
    getLatestLog,
    getOverallProgress,
    getWeeklyConsistency,
    getFirstWeight,
    today,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const summary = getDailySummary(today);
  const caloriesConsumed = summary.total_calories;
  const calorieTarget = profile?.calorie_target || 2000;
  const caloriesRemaining = calorieTarget - caloriesConsumed;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="p-4 pb-20 space-y-4">
      {/* Weekly Consistency Tracker */}
      {weeklyConsistency.length > 0 && (
        <div className="flex justify-between gap-1 px-2">
          {weeklyConsistency.map((day) => {
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => {
                  if (!day.isFuture) {
                    setSelectedDay(day);
                  }
                }}
                disabled={day.isFuture}
                className={`flex-1 flex flex-col items-center py-2 px-1 rounded-lg transition-colors ${
                  day.isToday
                    ? 'bg-slate-700 ring-1 ring-blue-500'
                    : day.isFuture
                      ? 'opacity-40'
                      : 'hover:bg-slate-700/50'
                }`}
              >
                <span
                  className={`text-xs font-medium mb-1.5 ${
                    day.isToday ? 'text-blue-400' : 'text-slate-400'
                  }`}
                >
                  {day.dayLabel}
                </span>
                <div className="flex gap-0.5">
                  {/* Weight dot */}
                  <div
                    className={`w-2 h-2 rounded-full ${
                      day.isFuture
                        ? 'bg-slate-700'
                        : day.hasWeight
                          ? 'bg-green-500'
                          : 'bg-slate-600'
                    }`}
                  />
                  {/* Food dot */}
                  <div
                    className={`w-2 h-2 rounded-full ${
                      day.isFuture
                        ? 'bg-slate-700'
                        : day.hasFood
                          ? 'bg-blue-500'
                          : 'bg-slate-600'
                    }`}
                  />
                  {/* Workout dot - only show on scheduled workout days */}
                  {day.isScheduledWorkoutDay && (
                    <div
                      className={`w-2 h-2 rounded-full ${
                        day.isFuture
                          ? 'bg-slate-700'
                          : day.hasWorkout
                            ? 'bg-orange-500'
                            : 'bg-slate-600'
                      }`}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

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

      {/* Calorie Summary Card — rings + macro legend match CalorieLog so the
          design language carries through. Dashboard keeps "remaining" framing
          in the ring center (at-a-glance) vs. CalorieLog's "consumed/target"
          (detail view). */}
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

          <div className="flex items-center gap-4">
            <NutritionRings
              consumed={{
                calories: caloriesConsumed,
                protein: summary.total_protein_g,
                carbs: summary.total_carbs_g,
                fat: summary.total_fat_g,
              }}
              targets={{
                calories: calorieTarget,
                protein: profile?.protein_target_g ?? 0,
                carbs: profile?.carbs_target_g ?? 0,
                fat: profile?.fat_target_g ?? 0,
              }}
              size={144}
              center={
                <>
                  <span
                    className={`text-2xl font-bold tabular-nums leading-none ${
                      caloriesRemaining < 0 ? 'text-rose-300' : 'text-white'
                    }`}
                  >
                    {formatCalories(Math.abs(caloriesRemaining))}
                  </span>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">
                    {caloriesRemaining < 0 ? 'kcal over' : 'kcal left'}
                  </span>
                </>
              }
            />
            <div className="flex-1 space-y-2">
              <DashboardMacroLine
                label="Protein"
                consumed={summary.total_protein_g}
                target={profile?.protein_target_g ?? 0}
                color={MACRO_PALETTE.protein.text}
                dot={MACRO_PALETTE.protein.hex}
              />
              <DashboardMacroLine
                label="Carbs"
                consumed={summary.total_carbs_g}
                target={profile?.carbs_target_g ?? 0}
                color={MACRO_PALETTE.carbs.text}
                dot={MACRO_PALETTE.carbs.hex}
              />
              <DashboardMacroLine
                label="Fat"
                consumed={summary.total_fat_g}
                target={profile?.fat_target_g ?? 0}
                color={MACRO_PALETTE.fat.text}
                dot={MACRO_PALETTE.fat.hex}
              />
              <DashboardMacroLine
                label="Calories"
                consumed={caloriesConsumed}
                target={calorieTarget}
                color={MACRO_PALETTE.calories.text}
                dot={MACRO_PALETTE.calories.hex}
                suffix=""
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => openFoodLogModal({ date: today, onSuccess: loadData })}
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

        <button
          type="button"
          onClick={() =>
            openWeightLogModal({ date: today, onSuccess: loadData })
          }
          className="w-full"
        >
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
        </button>

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

      {/* Day Details Bottom Sheet */}
      <Modal
        isOpen={selectedDay !== null}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? formatDisplayDate(selectedDay.date) : ''}
        size="sm"
      >
        {selectedDay && (
          <div className="space-y-3">
            {/* Status summary */}
            <div className="flex items-center justify-center gap-4 py-2">
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-3 h-3 rounded-full ${selectedDay.hasWeight ? 'bg-green-500' : 'bg-slate-600'}`}
                />
                <span className="text-sm text-slate-300">Weight</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-3 h-3 rounded-full ${selectedDay.hasFood ? 'bg-blue-500' : 'bg-slate-600'}`}
                />
                <span className="text-sm text-slate-300">Food</span>
              </div>
              {selectedDay.isScheduledWorkoutDay && (
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-3 h-3 rounded-full ${selectedDay.hasWorkout ? 'bg-orange-500' : 'bg-slate-600'}`}
                  />
                  <span className="text-sm text-slate-300">Workout</span>
                </div>
              )}
            </div>

            {/* Action buttons for missing items */}
            {(!selectedDay.hasWeight ||
              !selectedDay.hasFood ||
              (selectedDay.isScheduledWorkoutDay &&
                !selectedDay.hasWorkout)) && (
              <div className="space-y-2 pt-2 border-t border-slate-700">
                <p className="text-slate-400 text-xs text-center mb-3">
                  {selectedDay.isToday
                    ? 'Complete your daily logs'
                    : 'Log missed items'}
                </p>

                {!selectedDay.hasWeight && (
                  <button
                    type="button"
                    onClick={() => {
                      const date = selectedDay.date;
                      setSelectedDay(null);
                      openWeightLogModal({ date, onSuccess: loadData });
                    }}
                    className="w-full flex items-center gap-3 p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <div className="w-10 h-10 bg-green-600/20 rounded-lg flex items-center justify-center">
                      <Scale size={20} className="text-green-400" />
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-white font-medium text-sm">
                        Log Weight
                      </p>
                      <p className="text-slate-400 text-xs">
                        Record your weight for this day
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-slate-500" />
                  </button>
                )}

                {!selectedDay.hasFood && (
                  <button
                    type="button"
                    onClick={() => {
                      const date = selectedDay.date;
                      setSelectedDay(null);
                      openFoodLogModal({ date, onSuccess: loadData });
                    }}
                    className="w-full flex items-center gap-3 p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
                      <Utensils size={20} className="text-blue-400" />
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-white font-medium text-sm">Log Food</p>
                      <p className="text-slate-400 text-xs">
                        Record meals for this day
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-slate-500" />
                  </button>
                )}

                {selectedDay.isScheduledWorkoutDay &&
                  !selectedDay.hasWorkout && (
                    <Link
                      to={`/workout?date=${selectedDay.date}`}
                      onClick={() => setSelectedDay(null)}
                      className="w-full flex items-center gap-3 p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      <div className="w-10 h-10 bg-orange-600/20 rounded-lg flex items-center justify-center">
                        <Dumbbell size={20} className="text-orange-400" />
                      </div>
                      <div className="text-left flex-1">
                        <p className="text-white font-medium text-sm">
                          Workout Scheduled
                        </p>
                        <p className="text-slate-400 text-xs">
                          {selectedDay.isToday
                            ? 'Start your workout'
                            : 'Workout was scheduled for this day'}
                        </p>
                      </div>
                      <ChevronRight size={18} className="text-slate-500" />
                    </Link>
                  )}
              </div>
            )}

            {/* All complete message */}
            {selectedDay.hasWeight &&
              selectedDay.hasFood &&
              (!selectedDay.isScheduledWorkoutDay ||
                selectedDay.hasWorkout) && (
                <div className="text-center py-4">
                  <p className="text-green-400 text-sm">
                    All logged for this day!
                  </p>
                </div>
              )}
          </div>
        )}
      </Modal>
    </div>
  );
}

// Single-line "dot + label + consumed / target" legend row used beside the
// nutrition rings on Dashboard. Mirrors the legend rows inside
// components/nutrition/DailySummaryCard but kept inline here because
// Dashboard wants no copy-yesterday button and a slightly different layout.
interface DashboardMacroLineProps {
  label: string;
  consumed: number;
  target: number;
  color: string;
  dot: string;
  suffix?: string;
}

function DashboardMacroLine({
  label,
  consumed,
  target,
  color,
  dot,
  suffix = 'g',
}: DashboardMacroLineProps) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: dot }}
      />
      <span className="text-[10px] uppercase tracking-widest text-slate-500 w-20 flex-shrink-0">
        {label}
      </span>
      <span className={`text-xs tabular-nums font-semibold ${color}`}>
        {Math.round(consumed)}
      </span>
      <span className="text-xs text-slate-600 tabular-nums">
        / {Math.round(target)}
        {suffix}
      </span>
    </div>
  );
}
