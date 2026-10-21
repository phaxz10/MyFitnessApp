import { useCallback, useEffect, useState } from 'react';
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
import { useCalories } from '../hooks/useCalories';
import { useExerciseProgress } from '../hooks/useExerciseProgress';
import { useProfile } from '../hooks/useProfile';
import {
  type DayConsistency,
  useWeeklyConsistency,
} from '../hooks/useWeeklyConsistency';
import { useWeight } from '../hooks/useWeight';
import { useWorkoutLogs } from '../hooks/useWorkoutLogs';
import { useWorkoutPrograms } from '../hooks/useWorkoutPrograms';
import type {
  ProgramSessionWithExercises,
  WorkoutProgramWithSessions,
} from '../types';
import { formatDate } from '../utils/date';

export function Dashboard() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { fetchEntriesByDate, getDailySummary } = useCalories();
  const { getLatestLog, getFirstWeight } = useWeight();
  const {
    logs,
    fetchLogs,
    activeWorkout,
    resumeWorkout,
    startWorkout,
    getSessionStatusForDate,
  } = useWorkoutLogs();
  const { fetchActiveProgram } = useWorkoutPrograms();
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
  const [program, setProgram] = useState<WorkoutProgramWithSessions | null>(
    null,
  );
  const [todaySession, setTodaySession] =
    useState<ProgramSessionWithExercises | null>(null);
  const [sessionCompleted, setSessionCompleted] = useState(false);
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

      const [weightLog, progressData, consistency, firstWeight, activeProgram] =
        await Promise.all([
          getLatestLog(),
          getOverallProgress('7d'),
          getWeeklyConsistency(),
          getFirstWeight(),
          fetchActiveProgram(),
        ]);

      const session =
        activeProgram?.sessions.find(
          (s) => s.day_of_week === new Date().getDay(),
        ) ?? null;
      const status = session ? await getSessionStatusForDate(session.id) : null;
      setProgram(activeProgram);
      setTodaySession(session);
      setSessionCompleted(status?.status === 'completed');

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
    fetchActiveProgram,
    getSessionStatusForDate,
    today,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const summary = getDailySummary(today);
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
    openWeightLogModal({ date, onSuccess: loadData });
  };

  const logFoodFor = (date: string) => {
    setSelectedDay(null);
    openFoodLogModal({ date, onSuccess: loadData });
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
