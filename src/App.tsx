import { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from 'react-router-dom';
import { GlobalModalContainer } from './components/modals';
import { BottomNav, Header } from './components/ui';
import { useAppStore } from './hooks/useAppStore';
import { useProfile } from './hooks/useProfile';
import { useWorkoutLogs } from './hooks/useWorkoutLogs';
import { CalorieLog } from './pages/CalorieLog';

// Pages
import { Dashboard } from './pages/Dashboard';
import { DatabaseDebug } from './pages/DatabaseDebug';
import { ExerciseLibrary } from './pages/ExerciseLibrary';
import { MealScanner } from './pages/MealScanner';
import { Onboarding } from './pages/Onboarding';
import { ProgramEditor } from './pages/ProgramEditor';
import { Progress } from './pages/Progress';
import { Settings } from './pages/Settings';
import { WeightTracker } from './pages/WeightTracker';
import { Workout } from './pages/Workout';
import { WorkoutDetail } from './pages/WorkoutDetail';
import { WorkoutSession } from './pages/WorkoutSession';
import { getDB, isOnboardingComplete } from './services/db';
import { initGemini } from './services/gemini';

function MainLayout() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <Header />
      <main className="flex-1 max-w-lg mx-auto w-full">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

// Layout without bottom nav for workout session
function SessionLayout() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <main className="flex-1 max-w-lg mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}

function AppRoutes() {
  const {
    isOnboardingComplete: storeOnboardingComplete,
    setOnboardingComplete,
    setOnline,
    setUserProfile,
  } = useAppStore();
  const { profile, fetchProfile } = useProfile();
  const { processStaleWorkouts } = useWorkoutLogs();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        // Initialize database
        await getDB();

        // Check if onboarding is complete
        const complete = await isOnboardingComplete();
        setOnboardingComplete(complete);

        if (complete) {
          await fetchProfile();
          // Process any stale in_progress workouts from previous days
          await processStaleWorkouts();
        }
      } catch (err) {
        console.error('Failed to initialize app:', err);
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [setOnboardingComplete, fetchProfile, processStaleWorkouts]);

  // Initialize Gemini when profile is loaded
  useEffect(() => {
    if (profile?.gemini_api_key) {
      initGemini(profile.gemini_api_key);
      setUserProfile(profile);
    }
  }, [profile, setUserProfile]);

  // Track online status
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!storeOnboardingComplete) {
    return (
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* Main app routes with bottom nav */}
      <Route element={<MainLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/calories" element={<CalorieLog />} />
        <Route path="/workout" element={<Workout />} />
        <Route path="/exercises" element={<ExerciseLibrary />} />
        <Route path="/weight" element={<WeightTracker />} />
        <Route path="/scanner" element={<MealScanner />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      {/* Workout routes without bottom nav */}
      <Route element={<SessionLayout />}>
        <Route path="/workout/session" element={<WorkoutSession />} />
        <Route path="/workout/program/new" element={<ProgramEditor />} />
        <Route path="/workout/program/:id" element={<ProgramEditor />} />
        <Route path="/workout/progress" element={<Progress />} />
        <Route path="/workout/history/:id" element={<WorkoutDetail />} />
        <Route path="/debug/database" element={<DatabaseDebug />} />
      </Route>

      {/* Redirects */}
      <Route path="/onboarding" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
      <GlobalModalContainer />
    </BrowserRouter>
  );
}
