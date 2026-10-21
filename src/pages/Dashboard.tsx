import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BodyModule } from '../components/dashboard/BodyModule';
import { DayDetailModal } from '../components/dashboard/DayDetailModal';
import { NutritionModule } from '../components/dashboard/NutritionModule';
import { TrainingModule } from '../components/dashboard/TrainingModule';
import { WeekStrip } from '../components/dashboard/WeekStrip';
import { DashboardSkeleton } from '../components/ui';
import {
  WeeklyReviewButton,
  WeeklyReviewModal,
} from '../components/weekly-review';
import { useAppStore } from '../hooks/useAppStore';
import { summarizeDay } from '../hooks/useCalories';
import {
  useActiveProgram,
  useFirstWeight,
  useFoodEntriesForDate,
  useLatestWeightLog,
  useRecentWorkoutLogs,
  useResumableWorkout,
  useSessionStatus,
} from '../hooks/useDashboardData';
import { useProfile } from '../hooks/useProfile';
import { useOverallProgress } from '../hooks/useStrengthProgress';
import {
  type DayConsistency,
  useWeeklyConsistencyQuery,
} from '../hooks/useWeeklyConsistency';
import { useWorkoutLogs } from '../hooks/useWorkoutLogs';
import { formatDate } from '../utils/date';

export function Dashboard() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { startWorkout } = useWorkoutLogs();
  const { openFoodLogModal, openWeightLogModal } = useAppStore();
  const [showWeeklyReview, setShowWeeklyReview] = useState(false);
  const [selectedDay, setSelectedDay] = useState<DayConsistency | null>(null);
  const today = formatDate(new Date());

  // Cached reads (React Query); writes refresh them through the Write Bus.
  const food = useFoodEntriesForDate(today);
  const recentLogs = useRecentWorkoutLogs(5);
  const resumable = useResumableWorkout();
  const latestWeightLog = useLatestWeightLog();
  const firstWeight = useFirstWeight();
  const overview = useOverallProgress('7d');
  const consistency = useWeeklyConsistencyQuery();
  const activeProgram = useActiveProgram();

  const program = activeProgram.data ?? null;
  const todaySession =
    program?.sessions.find((s) => s.day_of_week === new Date().getDay()) ??
    null;
  const sessionStatus = useSessionStatus(todaySession?.id ?? null, today);

  const isLoading =
    food.isPending ||
    recentLogs.isPending ||
    resumable.isPending ||
    latestWeightLog.isPending ||
    firstWeight.isPending ||
    overview.isPending ||
    consistency.isPending ||
    activeProgram.isPending ||
    sessionStatus.isLoading;

  const logs = recentLogs.data ?? [];
  const activeWorkout = resumable.data ?? null;
  const latestWeight = latestWeightLog.data?.weight_kg ?? null;
  const startWeight = firstWeight.data ?? null;
  const weeklyWorkouts = overview.data?.totalWorkouts ?? 0;
  const recentPRsCount = overview.data?.recentPRs.length ?? 0;
  const weeklyConsistency = consistency.data?.days ?? [];
  const sessionCompleted = sessionStatus.data?.status === 'completed';

  const summary = summarizeDay(today, food.data ?? []);
  const consumed = {
    calories: summary.total_calories,
    protein: summary.total_protein_g,
    carbs: summary.total_carbs_g,
    fat: summary.total_fat_g,
  };
  const targets = {
    calories: profile?.calorie_target || 2000,
    protein: profile?.protein_target_g ?? 0,
    carbs: profile?.carbs_target_g ?? 0,
    fat: profile?.fat_target_g ?? 0,
  };
  const meals = Object.entries(summary.meals)
    .filter(([, entries]) => entries.length > 0)
    .map(([type, entries]) => ({
      type,
      items: entries.length,
      calories: entries.reduce((sum, e) => sum + e.calories, 0),
    }));
  const lastWorkout = logs[0]
    ? {
        name: logs[0].session_name || 'Quick workout',
        sets: logs[0].sets?.length || 0,
      }
    : null;

  const handleStartSession = async () => {
    if (!program || !todaySession) return;
    await startWorkout(program.id, todaySession.id);
    navigate('/workout/session');
  };

  const handleStartEmpty = async () => {
    await startWorkout(null, null);
    navigate('/workout/session');
  };

  const logWeightFor = (date: string) => {
    setSelectedDay(null);
    openWeightLogModal({ date });
  };

  const logFoodFor = (date: string) => {
    setSelectedDay(null);
    openFoodLogModal({ date });
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="px-4 py-4 space-y-4">
      {weeklyConsistency.length > 0 && (
        <WeekStrip
          days={weeklyConsistency}
          onSelect={(day) => setSelectedDay(day)}
        />
      )}

      {/* Shows on Mondays with at least 5 logged days */}
      <WeeklyReviewButton
        profile={profile}
        onStartReview={() => setShowWeeklyReview(true)}
      />

      {profile && (
        <WeeklyReviewModal
          isOpen={showWeeklyReview}
          onClose={() => setShowWeeklyReview(false)}
          profile={profile}
        />
      )}

      <TrainingModule
        program={program}
        session={todaySession}
        sessionCompleted={sessionCompleted}
        hasActiveWorkout={!!activeWorkout}
        weeklyWorkouts={weeklyWorkouts}
        recentPRsCount={recentPRsCount}
        lastWorkout={lastWorkout}
        onStart={handleStartSession}
        onResume={() => navigate('/workout/session')}
        onStartEmpty={handleStartEmpty}
        onChooseProgram={() => navigate('/workout')}
      />

      <NutritionModule
        consumed={consumed}
        targets={targets}
        meals={meals}
        onLogFood={() => logFoodFor(today)}
      />

      <BodyModule
        profile={profile ?? null}
        latestWeight={latestWeight}
        startWeight={startWeight}
        onLogWeight={() => logWeightFor(today)}
      />

      <DayDetailModal
        day={selectedDay}
        onClose={() => setSelectedDay(null)}
        onLogWeight={logWeightFor}
        onLogFood={logFoodFor}
      />
    </div>
  );
}
