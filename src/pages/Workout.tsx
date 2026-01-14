import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Dumbbell,
  Edit,
  MoreVertical,
  Play,
  Plus,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ProgramGeneratorWizard } from '../components/program-generator';
import {
  Button,
  Card,
  CardContent,
  Modal,
  WorkoutSkeleton,
} from '../components/ui';
import {
  useWorkoutLogs,
  type WorkoutLogWithSets,
} from '../hooks/useWorkoutLogs';
import { useWorkoutPrograms } from '../hooks/useWorkoutPrograms';
import type {
  ProgramSessionWithExercises,
  WorkoutProgram,
  WorkoutStatus,
} from '../types';
import { isToday, isYesterday, parseLocalTimestamp } from '../utils/date';
import { formatDurationFromMs } from '../utils/formatters';

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

  const [showProgramMenu, setShowProgramMenu] = useState<number | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<WorkoutProgram | null>(
    null,
  );
  const [showNewProgramOptions, setShowNewProgramOptions] = useState(false);
  const [showAIGenerator, setShowAIGenerator] = useState(false);
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
        ? new Date(dateParam + 'T12:00:00')
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

  const handleStartWorkout = async (session?: ProgramSessionWithExercises) => {
    if (activeWorkout) {
      // Resume existing workout
      navigate('/workout/session');
    } else if (session && activeProgram) {
      // Start scheduled workout (with optional date override for missed sessions)
      await startWorkout(activeProgram.id, session.id, dateParam || undefined);
      // Clear the date param and navigate to session
      setSearchParams({});
      navigate('/workout/session' + (dateParam ? `?date=${dateParam}` : ''));
    } else {
      // Start empty workout
      await startWorkout(null, null, dateParam || undefined);
      setSearchParams({});
      navigate('/workout/session' + (dateParam ? `?date=${dateParam}` : ''));
    }
  };

  const handleSetActive = async (programId: number) => {
    await setActiveProgramById(programId);
    setShowProgramMenu(null);
  };

  const handleDeleteProgram = async () => {
    if (showDeleteModal) {
      await deleteProgram(showDeleteModal.id);
      setShowDeleteModal(null);
    }
  };

  const formatDuration = (startedAt: string, endedAt: string | null) => {
    const start = parseLocalTimestamp(startedAt);
    const end = endedAt ? parseLocalTimestamp(endedAt) : new Date();
    const diffMs = end.getTime() - start.getTime();
    return formatDurationFromMs(diffMs);
  };

  const formatDate = (dateStr: string) => {
    if (isToday(dateStr)) return 'Today';
    if (isYesterday(dateStr)) return 'Yesterday';

    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  if (isLoading) {
    return <WorkoutSkeleton />;
  }

  return (
    <div className="p-4 pb-20">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold text-white">Training</h1>
        <div className="relative">
          <Button
            onClick={() => setShowNewProgramOptions(!showNewProgramOptions)}
          >
            <Plus size={18} className="mr-1" />
            New Program
          </Button>

          {showNewProgramOptions && (
            <div className="absolute right-0 top-full mt-1 bg-slate-700 rounded-lg shadow-lg z-20 overflow-hidden min-w-[200px]">
              <button
                type="button"
                onClick={() => {
                  setShowNewProgramOptions(false);
                  navigate('/workout/program/new');
                }}
                className="w-full px-4 py-3 text-left text-white hover:bg-slate-600 flex items-center gap-3"
              >
                <Plus size={18} />
                <div>
                  <div className="font-medium">Create Manually</div>
                  <div className="text-slate-400 text-xs">
                    Build your own program
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewProgramOptions(false);
                  setShowAIGenerator(true);
                }}
                className="w-full px-4 py-3 text-left text-white hover:bg-slate-600 flex items-center gap-3 border-t border-slate-600"
              >
                <Sparkles size={18} className="text-purple-400" />
                <div>
                  <div className="font-medium">Generate with AI</div>
                  <div className="text-slate-400 text-xs">
                    Let AI create a program for you
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Resume Active Workout Banner */}
      {activeWorkout && (
        <Card className="mb-4 border-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center animate-pulse">
                  <Dumbbell size={20} className="text-white" />
                </div>
                <div>
                  <p className="text-white font-semibold">
                    Workout in Progress
                  </p>
                  <p className="text-slate-400 text-sm">
                    Started {formatDuration(activeWorkout.started_at, null)} ago
                  </p>
                </div>
              </div>
              <Button onClick={() => navigate('/workout/session')}>
                Resume
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's Workout (from active program) */}
      {activeProgram && !activeWorkout && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-blue-400" />
                <span className="text-slate-400 text-sm">
                  {dateParam
                    ? `Workout for ${formatDate(dateParam)}`
                    : "Today's Workout"}
                </span>
              </div>
              <span className="text-xs text-slate-500">
                {activeProgram.name}
              </span>
            </div>

            {todaySession ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-semibold text-white">
                    {todaySession.name}
                  </h3>
                  {todaySessionStatus.status === 'completed' && (
                    <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      Completed
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {todaySession.exercises.slice(0, 4).map((ex) => (
                    <span
                      key={ex.id}
                      className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded"
                    >
                      {ex.exercise_name}
                    </span>
                  ))}
                  {todaySession.exercises.length > 4 && (
                    <span className="text-xs bg-slate-700 text-slate-400 px-2 py-1 rounded">
                      +{todaySession.exercises.length - 4} more
                    </span>
                  )}
                </div>
                {todaySessionStatus.status === 'completed' ? (
                  <div className="space-y-2">
                    <p className="text-green-400 text-sm text-center mb-2">
                      {dateParam
                        ? `This workout has already been logged for ${formatDate(dateParam)}.`
                        : "Great job! You've completed today's scheduled workout."}
                    </p>
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => handleStartWorkout()}
                    >
                      Start Empty Workout
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => handleStartWorkout(todaySession)}
                  >
                    <Play size={18} className="mr-2" />
                    {dateParam ? 'Log Missed Workout' : 'Start Workout'}
                  </Button>
                )}
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-slate-400 mb-2">
                  {dateParam ? 'No Session Scheduled' : 'Rest Day'}
                </p>
                <p className="text-slate-500 text-sm">
                  {dateParam
                    ? `No workout was scheduled for ${formatDate(dateParam)}`
                    : 'No workout scheduled for today'}
                </p>
                <Button
                  variant="secondary"
                  className="mt-3"
                  onClick={() => handleStartWorkout()}
                >
                  Start Empty Workout
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* No Active Program */}
      {!activeProgram && !activeWorkout && (
        <Card className="mb-4">
          <CardContent className="p-6 text-center">
            <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Dumbbell size={32} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              No Active Program
            </h3>
            <p className="text-slate-400 text-sm mb-4">
              Create or activate a workout program to schedule your sessions.
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => navigate('/workout/program/new')}>
                Create Your First Program
              </Button>
              <Button variant="secondary" onClick={() => handleStartWorkout()}>
                Start Empty Workout
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Programs List */}
      {programs.length > 0 && (
        <div className="mb-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-white">Programs</h2>
            <button
              type="button"
              onClick={() => navigate('/exercises')}
              className="text-blue-400 text-sm"
            >
              Exercise Library
            </button>
          </div>

          <div className="space-y-2">
            {programs.map((program) => (
              <Card
                key={program.id}
                className={program.is_active ? 'border-blue-500' : ''}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      className="flex-1 cursor-pointer text-left"
                      onClick={() => navigate(`/workout/program/${program.id}`)}
                    >
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white">
                          {program.name}
                        </h3>
                        {program.is_active && (
                          <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-slate-400 text-sm">
                        {program.sessions_per_week}x per week
                      </p>
                    </button>

                    <div className="flex items-center gap-2">
                      <ChevronRight size={20} className="text-slate-500" />
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowProgramMenu(
                              showProgramMenu === program.id
                                ? null
                                : program.id,
                            );
                          }}
                          className="p-2 text-slate-400 hover:text-white"
                        >
                          <MoreVertical size={18} />
                        </button>

                        {showProgramMenu === program.id && (
                          <div className="absolute right-0 top-full mt-1 bg-slate-700 rounded-lg shadow-lg z-20 overflow-hidden min-w-[150px]">
                            {!program.is_active && (
                              <button
                                onClick={() => handleSetActive(program.id)}
                                className="w-full px-4 py-2 text-left text-white hover:bg-slate-600 flex items-center gap-2"
                              >
                                <CheckCircle2 size={16} />
                                Set Active
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setShowProgramMenu(null);
                                navigate(`/workout/program/${program.id}`);
                              }}
                              className="w-full px-4 py-2 text-left text-white hover:bg-slate-600 flex items-center gap-2"
                            >
                              <Edit size={16} />
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                setShowProgramMenu(null);
                                setShowDeleteModal(program);
                              }}
                              className="w-full px-4 py-2 text-left text-red-400 hover:bg-slate-600 flex items-center gap-2"
                            >
                              <Trash2 size={16} />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recent Workouts */}
      <Card>
        <CardContent className="p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-white">
              Recent Workouts
            </h3>
            <button
              type="button"
              onClick={() => navigate('/workout/progress')}
              className="text-blue-400 text-sm flex items-center gap-1"
            >
              <TrendingUp size={14} />
              View Progress
            </button>
          </div>

          {logs.length === 0 ? (
            <p className="text-slate-500 text-center py-8">
              No workout history yet. Start your first session!
            </p>
          ) : (
            <div className="space-y-3">
              {logs.map((log: WorkoutLogWithSets) => (
                <button
                  type="button"
                  key={log.id}
                  onClick={() => navigate(`/workout/history/${log.id}`)}
                  className="w-full flex items-center justify-between p-3 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition-colors text-left"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">
                        {log.session_name || 'Quick Workout'}
                      </span>
                      {log.program_name && (
                        <span className="text-xs text-slate-400">
                          ({log.program_name})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-slate-400 text-sm mt-1">
                      <span>{formatDate(log.date)}</span>
                      {log.ended_at && (
                        <span className="flex items-center gap-1">
                          <Clock size={14} />
                          {formatDuration(log.started_at, log.ended_at)}
                        </span>
                      )}
                      <span>{log.sets.length} sets</span>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-slate-500" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!showDeleteModal}
        onClose={() => setShowDeleteModal(null)}
        title="Delete Program"
      >
        <p className="text-slate-300 mb-6">
          Are you sure you want to delete "{showDeleteModal?.name}"? This action
          cannot be undone.
        </p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setShowDeleteModal(null)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700"
            onClick={handleDeleteProgram}
          >
            Delete
          </Button>
        </div>
      </Modal>

      {/* AI Program Generator Wizard */}
      <ProgramGeneratorWizard
        isOpen={showAIGenerator}
        onClose={() => {
          setShowAIGenerator(false);
          fetchPrograms();
        }}
      />

      {/* Click outside to close menus */}
      {(showProgramMenu || showNewProgramOptions) && (
        <button
          type="button"
          className="fixed inset-0 z-0 w-full h-full cursor-default"
          onClick={() => {
            setShowProgramMenu(null);
            setShowNewProgramOptions(false);
          }}
          aria-label="Close menu"
        />
      )}
    </div>
  );
}
