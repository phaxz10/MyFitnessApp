import { Dumbbell, Plus, Sparkles, TrendingUp } from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  formatElapsed,
  formatRelativeDay,
} from '../components/training/format';
import { Menu, MenuItem } from '../components/training/Menu';
import { ProgramList } from '../components/training/ProgramList';
import { RecentWorkouts } from '../components/training/RecentWorkouts';
import { TodaySessionCard } from '../components/training/TodaySessionCard';
import { Button, Card, ConfirmModal, WorkoutSkeleton } from '../components/ui';
import { useWorkoutLogs } from '../hooks/useWorkoutLogs';
import { useWorkoutPrograms } from '../hooks/useWorkoutPrograms';
import type {
  ProgramSessionWithExercises,
  WorkoutProgram,
  WorkoutStatus,
} from '../types';
import { getLocalDateString } from '../utils/date';
import { pgDate } from '../utils/pgValues';

function SectionHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 pt-2">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      {children && <div className="flex items-center gap-1">{children}</div>}
    </div>
  );
}

const LINK_BUTTON =
  'inline-flex items-center gap-1.5 h-11 px-2 rounded-lg text-sm font-semibold text-train-ink hover:bg-sunken';

export function Workout() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const dateParam = searchParams.get('date'); // YYYY-MM-DD format for logging missed sessions
  const {
    programs,
    activeProgram,
    fetchPrograms,
    fetchActiveProgram,
    setActiveProgramById,
    deleteProgram,
  } = useWorkoutPrograms();
  const {
    logs,
    activeWorkout,
    fetchLogs,
    resumeWorkout,
    startWorkout,
    getSessionStatusForDate,
  } = useWorkoutLogs();

  const [showDeleteModal, setShowDeleteModal] = useState<WorkoutProgram | null>(
    null,
  );
  const [todaySession, setTodaySession] =
    useState<ProgramSessionWithExercises | null>(null);
  const [todaySessionStatus, setTodaySessionStatus] = useState<{
    hasWorkout: boolean;
    status: WorkoutStatus | null;
    workoutId: number | null;
  }>({ hasWorkout: false, status: null, workoutId: null });
  const [isLoading, setIsLoading] = useState(true);

  // Check session status for the target date (today or dateParam for missed sessions)
  const checkSessionStatus = useCallback(async () => {
    if (todaySession) {
      // Use dateParam if provided (for missed workouts), otherwise check today
      const status = await getSessionStatusForDate(
        todaySession.id,
        dateParam || undefined,
      );
      setTodaySessionStatus(status);
    } else {
      setTodaySessionStatus({
        hasWorkout: false,
        status: null,
        workoutId: null,
      });
    }
  }, [todaySession, getSessionStatusForDate, dateParam]);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          fetchPrograms(),
          fetchActiveProgram(),
          fetchLogs(10),
          resumeWorkout(),
        ]);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [fetchPrograms, fetchActiveProgram, fetchLogs, resumeWorkout]);

  // Find today's session from active program (or session for dateParam if provided)
  useEffect(() => {
    if (activeProgram) {
      // If dateParam is provided, find the session for that date's day of week
      const targetDate = dateParam
        ? new Date(`${dateParam}T12:00:00`)
        : new Date();
      const dayOfWeek = targetDate.getDay();
      const session = activeProgram.sessions.find(
        (s) => s.day_of_week === dayOfWeek,
      );
      setTodaySession(session || null);
    } else {
      setTodaySession(null);
    }
  }, [activeProgram, dateParam]);

  // Check status when todaySession or dateParam changes
  useEffect(() => {
    checkSessionStatus();
  }, [checkSessionStatus]);

  // The session route for a workout: past-day logs keep their ?date.
  const sessionPath = (date: unknown) => {
    const day = date ? pgDate(date) : '';
    return `/workout/session${day && day !== getLocalDateString() ? `?date=${day}` : ''}`;
  };

  // Busy guard: a double tap on Start must not start twice (the writer also
  // returns the in-progress workout instead of creating a second).
  const startingRef = useRef(false);

  const handleStartWorkout = async (session?: ProgramSessionWithExercises) => {
    if (activeWorkout) {
      navigate(sessionPath(activeWorkout.date));
      return;
    }
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      // Scheduled session (with optional date override for missed sessions),
      // or an empty workout.
      const workout =
        session && activeProgram
          ? await startWorkout(
              activeProgram.id,
              session.id,
              dateParam || undefined,
            )
          : await startWorkout(null, null, dateParam || undefined);
      setSearchParams({});
      navigate(sessionPath(workout.date));
    } finally {
      startingRef.current = false;
    }
  };

  const handleDeleteProgram = async () => {
    if (showDeleteModal) {
      await deleteProgram(showDeleteModal.id);
      setShowDeleteModal(null);
    }
  };

  if (isLoading) {
    return <WorkoutSkeleton />;
  }

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Resume active workout */}
      {activeWorkout && (
        <Card className="border-train">
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <span className="grid place-items-center size-11 shrink-0 rounded-lg bg-train text-on-accent">
                <Dumbbell size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="text-lg font-bold text-ink">
                  Workout in Progress
                </p>
                <p className="text-ink-2 text-sm">
                  Started{' '}
                  <span className="num">
                    {formatElapsed(activeWorkout.started_at, null)}
                  </span>{' '}
                  ago
                </p>
              </div>
            </div>
            <Button
              size="lg"
              className="w-full"
              onClick={() => navigate(sessionPath(activeWorkout.date))}
            >
              Resume
            </Button>
          </div>
        </Card>
      )}

      {/* Today's session (from active program) */}
      {activeProgram && !activeWorkout && (
        <TodaySessionCard
          programName={activeProgram.name}
          session={todaySession}
          isCompleted={todaySessionStatus.status === 'completed'}
          missedDayLabel={dateParam ? formatRelativeDay(dateParam) : null}
          onStartSession={handleStartWorkout}
          onStartEmpty={() => handleStartWorkout()}
          onEditProgram={() => navigate(`/workout/program/${activeProgram.id}`)}
        />
      )}

      {/* No active program */}
      {!activeProgram && !activeWorkout && (
        <Card>
          <div className="p-4">
            <span className="grid place-items-center size-12 rounded-lg bg-train-soft text-train-ink mb-3">
              <Dumbbell size={24} aria-hidden="true" />
            </span>
            <h2 className="text-lg font-bold text-ink">No Active Program</h2>
            <p className="text-ink-2 mt-1 mb-4">
              Create or activate a workout program to schedule your sessions.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                size="lg"
                className="w-full"
                onClick={() => navigate('/workout/program/new')}
              >
                Create Your First Program
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={() => handleStartWorkout()}
              >
                Start Empty Workout
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Programs */}
      <section className="space-y-2">
        <SectionHeader title="Programs">
          <button
            type="button"
            onClick={() => navigate('/exercises')}
            className={LINK_BUTTON}
          >
            Exercise Library
          </button>
          {programs.length > 0 && (
            <Menu
              label="New program"
              minWidth="min-w-60"
              trigger={
                <>
                  <Plus size={18} aria-hidden="true" />
                  New
                </>
              }
              triggerClassName="inline-flex items-center gap-1.5 h-11 px-3 rounded-xl border border-line-strong bg-surface text-sm font-semibold text-ink hover:bg-sunken"
            >
              {(close) => (
                <>
                  <MenuItem
                    icon={<Sparkles size={18} />}
                    description="Describe it; edit everything before saving"
                    onSelect={() => {
                      close();
                      navigate('/workout/program/new?ai=1');
                    }}
                  >
                    Generate with AI
                  </MenuItem>
                  <MenuItem
                    icon={<Plus size={18} />}
                    description="Build your own program"
                    onSelect={() => {
                      close();
                      navigate('/workout/program/new');
                    }}
                  >
                    Create manually
                  </MenuItem>
                </>
              )}
            </Menu>
          )}
        </SectionHeader>

        {programs.length > 0 ? (
          <ProgramList
            programs={programs}
            onOpen={(programId) => navigate(`/workout/program/${programId}`)}
            onSetActive={setActiveProgramById}
            onDelete={setShowDeleteModal}
          />
        ) : (
          <Card>
            <div className="p-4 space-y-3">
              <p className="text-ink-2">
                Tell the AI what you want and it builds the program. You can
                edit everything before saving.
              </p>
              <Button
                tone="ink"
                size="lg"
                className="w-full"
                onClick={() => navigate('/workout/program/new?ai=1')}
              >
                <Sparkles size={20} aria-hidden="true" />
                Generate with AI
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => navigate('/workout/program/new')}
              >
                Build manually
              </Button>
            </div>
          </Card>
        )}
      </section>

      {/* History */}
      <section className="space-y-2">
        <SectionHeader title="Recent Workouts">
          <button
            type="button"
            onClick={() => navigate('/workout/progress')}
            className={LINK_BUTTON}
          >
            <TrendingUp size={16} aria-hidden="true" />
            View Progress
          </button>
        </SectionHeader>

        {logs.length === 0 ? (
          <Card>
            <div className="p-4 flex items-center justify-between gap-3">
              <p className="text-ink-2">
                No workout history yet. Start your first session!
              </p>
              {!activeWorkout && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  onClick={() => handleStartWorkout()}
                >
                  Start
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <RecentWorkouts
            logs={logs}
            onOpen={(logId) => navigate(`/workout/history/${logId}`)}
          />
        )}
      </section>

      <ConfirmModal
        isOpen={!!showDeleteModal}
        onClose={() => setShowDeleteModal(null)}
        title="Delete Program"
        confirmLabel="Delete"
        onConfirm={handleDeleteProgram}
        danger
      >
        Are you sure you want to delete "{showDeleteModal?.name}"? This action
        cannot be undone.
      </ConfirmModal>
    </div>
  );
}
