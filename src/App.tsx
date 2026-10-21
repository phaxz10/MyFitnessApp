import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { GlobalModalContainer } from './components/modals';
import { SupportPrompt } from './components/support/SupportPrompt';
import { BottomNav, Header } from './components/ui';
import { useAppStore } from './hooks/useAppStore';
import { useProfile } from './hooks/useProfile';
import { useWorkoutLogs } from './hooks/useWorkoutLogs';
import { queryClient } from './lib/queryClient';
import { CalorieLog } from './pages/CalorieLog';

// Pages
import { Dashboard } from './pages/Dashboard';
import { DatabaseDebug } from './pages/DatabaseDebug';
import { ExerciseLibrary } from './pages/ExerciseLibrary';
import { Onboarding } from './pages/Onboarding';
import { ProgramEditor } from './pages/ProgramEditor';
import { Progress } from './pages/Progress';
import { Settings } from './pages/Settings';
import { WeightTracker } from './pages/WeightTracker';
import { Workout } from './pages/Workout';
import { WorkoutDetail } from './pages/WorkoutDetail';
import { WorkoutSession } from './pages/WorkoutSession';
import { fetchOpenRouterModels } from './services/ai/openrouterModels';
import { getDB, isOnboardingComplete } from './services/db';

// Each route starts at the top instead of inheriting the previous scroll.
function useScrollToTopOnNavigate() {
  const { pathname } = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger, not a value read inside
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
}

function MainLayout() {
  useScrollToTopOnNavigate();
  return (
    <div className="min-h-dvh bg-canvas flex flex-col">
      <Header />
      <main className="flex-1 max-w-lg mx-auto w-full pb-[calc(4rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <BottomNav />
      <SupportPrompt />
    </div>
  );
}

// Layout without bottom nav for workout session
function SessionLayout() {
  useScrollToTopOnNavigate();
  return (
    <div className="min-h-dvh bg-canvas flex flex-col">
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
  const { profile } = useProfile();
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
  }, [setOnboardingComplete, processStaleWorkouts]);

  // Mirror the profile into Zustand so the stateless aiClient can read the API key.
  useEffect(() => {
    if (profile) {
      setUserProfile(profile);
    }
  }, [profile, setUserProfile]);

  // Keep the model catalog warm (24h cache) so per-model capabilities such as
  // reasoning support stay known without visiting Settings. Free, no key.
  const hasAIKey = !!profile?.ai_api_key;
  useEffect(() => {
    if (hasAIKey && navigator.onLine) fetchOpenRouterModels().catch(() => {});
  }, [hasAIKey]);

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
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-train border-t-transparent rounded-full animate-spin" />
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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
        <GlobalModalContainer />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
