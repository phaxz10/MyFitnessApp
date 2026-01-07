import { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from 'react-router-dom';
import { Header, BottomNav } from './components/ui';
import { useAppStore } from './hooks/useAppStore';
import { useProfile } from './hooks/useProfile';
import { getDB, isOnboardingComplete } from './services/db';
import { initGemini } from './services/gemini';

// Pages
import { Dashboard } from './pages/Dashboard';
import { CalorieLog } from './pages/CalorieLog';
import { Workout } from './pages/Workout';
import { WorkoutSession } from './pages/WorkoutSession';
import { ProgramEditor } from './pages/ProgramEditor';
import { ExerciseLibrary } from './pages/ExerciseLibrary';
import { WeightTracker } from './pages/WeightTracker';
import { Settings } from './pages/Settings';
import { Onboarding } from './pages/Onboarding';
import { MealScanner } from './pages/MealScanner';

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
        }
      } catch (err) {
        console.error('Failed to initialize app:', err);
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [setOnboardingComplete, fetchProfile]);

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
        <Route path="/weight" element={<WeightTracker />} />
        <Route path="/scanner" element={<MealScanner />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      {/* Workout routes without bottom nav */}
      <Route element={<SessionLayout />}>
        <Route path="/workout/session" element={<WorkoutSession />} />
        <Route path="/workout/program/new" element={<ProgramEditor />} />
        <Route path="/workout/program/:id" element={<ProgramEditor />} />
        <Route path="/workout/exercises" element={<ExerciseLibrary />} />
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
    </BrowserRouter>
  );
}
