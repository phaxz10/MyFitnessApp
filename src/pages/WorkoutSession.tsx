import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft,
  Plus, 
  Check,
  Trash2,
  Timer,
  ChevronDown,
  ChevronUp,
  X,
  Save
} from 'lucide-react';
import { Card, CardContent, Button, Input, Modal } from '../components/ui';
import { RestTimer } from '../components/workout';
import { useWorkoutLogs } from '../hooks/useWorkoutLogs';
import { useWorkoutPrograms } from '../hooks/useWorkoutPrograms';
import { useExercises } from '../hooks/useExercises';
import type { 
  Exercise, 
  ProgramExerciseWithDetails,
  WorkoutSet 
} from '../types';

interface ExerciseWithSets {
  exercise: Exercise | ProgramExerciseWithDetails;
  sets: {
    id?: number;
    reps: string;
    weight: string;
    completed: boolean;
  }[];
  lastPerformance: WorkoutSet[] | null;
  isExpanded: boolean;
}

export function WorkoutSession() {
  const navigate = useNavigate();
  const { 
    activeWorkout, 
    activeWorkoutSets,
    resumeWorkout,
    endWorkout,
    cancelWorkout,
    addSet,
    deleteSet 
  } = useWorkoutLogs();
  const { activeProgram, fetchActiveProgram } = useWorkoutPrograms();
  const { exercises: allExercises, fetchExercises } = useExercises();
  const { getLastPerformance } = useWorkoutLogs();

  const [exercisesWithSets, setExercisesWithSets] = useState<ExerciseWithSets[]>([]);
  const [showTimer, setShowTimer] = useState(false);
  const [timerMinimized, setTimerMinimized] = useState(false);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [showEndWorkout, setShowEndWorkout] = useState(false);
  const [showCancelWorkout, setShowCancelWorkout] = useState(false);
  const [workoutNotes, setWorkoutNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);

  // Resume workout on mount
  useEffect(() => {
    const init = async () => {
      await resumeWorkout();
      await fetchActiveProgram();
      await fetchExercises();
    };
    init();
  }, [resumeWorkout, fetchActiveProgram, fetchExercises]);

  // Initialize exercises from program session
  useEffect(() => {
    const initExercises = async () => {
      if (!activeWorkout) return;

      // If workout has a session, load those exercises
      if (activeWorkout.session_id && activeProgram) {
        const session = activeProgram.sessions.find(s => s.id === activeWorkout.session_id);
        if (session) {
          const exercisesData: ExerciseWithSets[] = await Promise.all(
            session.exercises.map(async (ex) => {
              const lastPerf = await getLastPerformance(ex.exercise_id);
              // Create empty sets based on target
              const sets = Array.from({ length: ex.target_sets }, (_, i) => {
                // Pre-fill from last performance if available
                const lastSet = lastPerf?.[i];
                return {
                  reps: lastSet?.reps?.toString() || ex.target_rep_min.toString(),
                  weight: lastSet?.weight_kg?.toString() || '0',
                  completed: false,
                };
              });
              return {
                exercise: ex,
                sets,
                lastPerformance: lastPerf,
                isExpanded: true,
              };
            })
          );
          setExercisesWithSets(exercisesData);
        }
      }
      
      // Load any already logged sets
      if (activeWorkoutSets.length > 0) {
        // Group sets by exercise
        const setsByExercise = activeWorkoutSets.reduce((acc, set) => {
          if (!acc[set.exercise_id]) {
            acc[set.exercise_id] = [];
          }
          acc[set.exercise_id].push(set);
          return acc;
        }, {} as Record<number, typeof activeWorkoutSets>);

        setExercisesWithSets(prev => {
          return prev.map(ex => {
            const exerciseId = 'exercise_id' in ex.exercise ? ex.exercise.exercise_id : ex.exercise.id;
            const loggedSets = setsByExercise[exerciseId];
            if (loggedSets) {
              return {
                ...ex,
                sets: loggedSets.map(s => ({
                  id: s.id,
                  reps: s.reps.toString(),
                  weight: s.weight_kg.toString(),
                  completed: true,
                })),
              };
            }
            return ex;
          });
        });
      }
    };

    initExercises();
  }, [activeWorkout, activeProgram, activeWorkoutSets, getLastPerformance]);

  // Elapsed time timer
  useEffect(() => {
    if (!activeWorkout) return;

    const startTime = new Date(activeWorkout.started_at).getTime();
    
    const interval = setInterval(() => {
      const now = Date.now();
      setElapsedTime(Math.floor((now - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [activeWorkout]);

  const formatElapsedTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSetChange = (exerciseIndex: number, setIndex: number, field: 'reps' | 'weight', value: string) => {
    setExercisesWithSets(prev => {
      const updated = [...prev];
      updated[exerciseIndex] = {
        ...updated[exerciseIndex],
        sets: updated[exerciseIndex].sets.map((set, i) => 
          i === setIndex ? { ...set, [field]: value } : set
        ),
      };
      return updated;
    });
  };

  const handleCompleteSet = async (exerciseIndex: number, setIndex: number) => {
    if (!activeWorkout) return;

    const exerciseData = exercisesWithSets[exerciseIndex];
    const setData = exerciseData.sets[setIndex];
    const exerciseId = 'exercise_id' in exerciseData.exercise 
      ? exerciseData.exercise.exercise_id 
      : exerciseData.exercise.id;

    const reps = parseInt(setData.reps) || 0;
    const weight = parseFloat(setData.weight) || 0;

    if (reps === 0) return;

    try {
      const newSet = await addSet(activeWorkout.id, exerciseId, reps, weight);
      
      setExercisesWithSets(prev => {
        const updated = [...prev];
        updated[exerciseIndex] = {
          ...updated[exerciseIndex],
          sets: updated[exerciseIndex].sets.map((set, i) => 
            i === setIndex ? { ...set, id: newSet.id, completed: true } : set
          ),
        };
        return updated;
      });

      // Auto-start rest timer
      setShowTimer(true);
    } catch (err) {
      console.error('Failed to log set:', err);
    }
  };

  const handleDeleteSet = async (exerciseIndex: number, setIndex: number) => {
    const setData = exercisesWithSets[exerciseIndex].sets[setIndex];
    
    if (setData.id) {
      await deleteSet(setData.id);
    }

    setExercisesWithSets(prev => {
      const updated = [...prev];
      updated[exerciseIndex] = {
        ...updated[exerciseIndex],
        sets: updated[exerciseIndex].sets.filter((_, i) => i !== setIndex),
      };
      return updated;
    });
  };

  const handleAddSet = (exerciseIndex: number) => {
    setExercisesWithSets(prev => {
      const updated = [...prev];
      const lastSet = updated[exerciseIndex].sets[updated[exerciseIndex].sets.length - 1];
      updated[exerciseIndex] = {
        ...updated[exerciseIndex],
        sets: [
          ...updated[exerciseIndex].sets,
          {
            reps: lastSet?.reps || '0',
            weight: lastSet?.weight || '0',
            completed: false,
          },
        ],
      };
      return updated;
    });
  };

  const handleAddExercise = useCallback(async (exercise: Exercise) => {
    const lastPerf = await getLastPerformance(exercise.id);
    
    setExercisesWithSets(prev => [
      ...prev,
      {
        exercise,
        sets: [{
          reps: lastPerf?.[0]?.reps?.toString() || '10',
          weight: lastPerf?.[0]?.weight_kg?.toString() || '0',
          completed: false,
        }],
        lastPerformance: lastPerf,
        isExpanded: true,
      },
    ]);
    setShowAddExercise(false);
    setSearchQuery('');
  }, [getLastPerformance]);

  const handleRemoveExercise = (exerciseIndex: number) => {
    // Delete all logged sets for this exercise
    const exercise = exercisesWithSets[exerciseIndex];
    exercise.sets.forEach(async (set) => {
      if (set.id) {
        await deleteSet(set.id);
      }
    });

    setExercisesWithSets(prev => prev.filter((_, i) => i !== exerciseIndex));
  };

  const toggleExerciseExpand = (index: number) => {
    setExercisesWithSets(prev => 
      prev.map((ex, i) => 
        i === index ? { ...ex, isExpanded: !ex.isExpanded } : ex
      )
    );
  };

  const handleEndWorkout = async () => {
    if (!activeWorkout) return;
    await endWorkout(activeWorkout.id, workoutNotes || undefined);
    navigate('/workout');
  };

  const handleCancelWorkout = async () => {
    if (!activeWorkout) return;
    await cancelWorkout(activeWorkout.id);
    navigate('/workout');
  };

  const filteredExercises = allExercises.filter(ex => 
    ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ex.muscle_groups?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalSets = exercisesWithSets.reduce((sum, ex) => 
    sum + ex.sets.filter(s => s.completed).length, 0
  );

  if (!activeWorkout) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-slate-400 mb-4">No active workout</p>
          <Button onClick={() => navigate('/workout')}>
            Go to Workouts
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-32">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button 
          onClick={() => setShowCancelWorkout(true)}
          className="p-2 text-slate-400 hover:text-white"
        >
          <ArrowLeft size={24} />
        </button>
        
        <div className="text-center">
          <p className="text-slate-400 text-sm">Workout Time</p>
          <p className="text-white font-mono text-xl">{formatElapsedTime(elapsedTime)}</p>
        </div>

        <button
          onClick={() => setShowTimer(true)}
          className="p-2 text-slate-400 hover:text-white"
        >
          <Timer size={24} />
        </button>
      </div>

      {/* Stats Bar */}
      <div className="flex justify-around mb-6 p-3 bg-slate-800 rounded-lg">
        <div className="text-center">
          <p className="text-2xl font-bold text-white">{exercisesWithSets.length}</p>
          <p className="text-xs text-slate-400">Exercises</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-white">{totalSets}</p>
          <p className="text-xs text-slate-400">Sets Done</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-white">
            {exercisesWithSets.reduce((sum, ex) => 
              sum + ex.sets.filter(s => s.completed).reduce((setSum, s) => 
                setSum + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0
              ), 0
            ).toFixed(0)}
          </p>
          <p className="text-xs text-slate-400">Volume (kg)</p>
        </div>
      </div>

      {/* Exercises */}
      {exercisesWithSets.length === 0 ? (
        <Card className="mb-4">
          <CardContent className="p-6 text-center">
            <p className="text-slate-400 mb-4">No exercises added yet</p>
            <Button onClick={() => setShowAddExercise(true)}>
              <Plus size={18} className="mr-2" />
              Add Exercise
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {exercisesWithSets.map((exerciseData, exerciseIndex) => {
            const exerciseName = 'exercise_name' in exerciseData.exercise 
              ? exerciseData.exercise.exercise_name 
              : exerciseData.exercise.name;
            const targetReps = 'target_rep_min' in exerciseData.exercise
              ? `${exerciseData.exercise.target_rep_min}-${exerciseData.exercise.target_rep_max}`
              : null;

            return (
              <Card key={exerciseIndex}>
                <CardContent className="p-4">
                  {/* Exercise Header */}
                  <div 
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => toggleExerciseExpand(exerciseIndex)}
                  >
                    <div className="flex-1">
                      <h3 className="font-semibold text-white">{exerciseName}</h3>
                      {targetReps && (
                        <p className="text-slate-400 text-sm">Target: {targetReps} reps</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-sm">
                        {exerciseData.sets.filter(s => s.completed).length}/{exerciseData.sets.length}
                      </span>
                      {exerciseData.isExpanded ? (
                        <ChevronUp size={20} className="text-slate-400" />
                      ) : (
                        <ChevronDown size={20} className="text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Sets */}
                  {exerciseData.isExpanded && (
                    <div className="mt-4">
                      {/* Last Performance */}
                      {exerciseData.lastPerformance && exerciseData.lastPerformance.length > 0 && (
                        <div className="mb-3 p-2 bg-slate-700/50 rounded text-xs text-slate-400">
                          Last: {exerciseData.lastPerformance.map(s => 
                            `${s.weight_kg}kg × ${s.reps}`
                          ).join(' | ')}
                        </div>
                      )}

                      {/* Set Headers */}
                      <div className="grid grid-cols-12 gap-2 mb-2 text-xs text-slate-400">
                        <div className="col-span-2 text-center">SET</div>
                        <div className="col-span-3 text-center">PREV</div>
                        <div className="col-span-2 text-center">KG</div>
                        <div className="col-span-2 text-center">REPS</div>
                        <div className="col-span-3"></div>
                      </div>

                      {/* Sets List */}
                      {exerciseData.sets.map((set, setIndex) => {
                        const prevSet = exerciseData.lastPerformance?.[setIndex];
                        
                        return (
                          <div 
                            key={setIndex}
                            className={`grid grid-cols-12 gap-2 items-center py-2 ${
                              set.completed ? 'bg-green-900/20 rounded' : ''
                            }`}
                          >
                            <div className="col-span-2 text-center text-slate-300">
                              {setIndex + 1}
                            </div>
                            <div className="col-span-3 text-center text-slate-500 text-sm">
                              {prevSet ? `${prevSet.weight_kg}×${prevSet.reps}` : '-'}
                            </div>
                            <div className="col-span-2">
                              <Input
                                type="number"
                                value={set.weight}
                                onChange={(e) => handleSetChange(exerciseIndex, setIndex, 'weight', e.target.value)}
                                className="text-center p-1 h-8"
                                disabled={set.completed}
                              />
                            </div>
                            <div className="col-span-2">
                              <Input
                                type="number"
                                value={set.reps}
                                onChange={(e) => handleSetChange(exerciseIndex, setIndex, 'reps', e.target.value)}
                                className="text-center p-1 h-8"
                                disabled={set.completed}
                              />
                            </div>
                            <div className="col-span-3 flex justify-end gap-1">
                              {set.completed ? (
                                <button
                                  onClick={() => handleDeleteSet(exerciseIndex, setIndex)}
                                  className="p-1 text-red-400 hover:text-red-300"
                                >
                                  <Trash2 size={16} />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleCompleteSet(exerciseIndex, setIndex)}
                                  className="p-1 bg-blue-600 rounded text-white hover:bg-blue-500"
                                >
                                  <Check size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Add Set / Remove Exercise */}
                      <div className="flex justify-between mt-3 pt-3 border-t border-slate-700">
                        <button
                          onClick={() => handleAddSet(exerciseIndex)}
                          className="text-blue-400 text-sm flex items-center gap-1"
                        >
                          <Plus size={16} />
                          Add Set
                        </button>
                        <button
                          onClick={() => handleRemoveExercise(exerciseIndex)}
                          className="text-red-400 text-sm flex items-center gap-1"
                        >
                          <Trash2 size={16} />
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Exercise Button */}
      <Button 
        variant="secondary" 
        className="w-full mt-4"
        onClick={() => setShowAddExercise(true)}
      >
        <Plus size={18} className="mr-2" />
        Add Exercise
      </Button>

      {/* Finish Workout Button */}
      <div className="fixed bottom-20 left-0 right-0 p-4 bg-gradient-to-t from-slate-900 to-transparent">
        <Button 
          className="w-full max-w-lg mx-auto block"
          onClick={() => setShowEndWorkout(true)}
          disabled={totalSets === 0}
        >
          <Save size={18} className="mr-2" />
          Finish Workout
        </Button>
      </div>

      {/* Rest Timer */}
      {showTimer && !timerMinimized && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm">
            <RestTimer
              defaultSeconds={90}
              onClose={() => setShowTimer(false)}
              onToggleMinimize={() => setTimerMinimized(true)}
            />
          </div>
        </div>
      )}

      {timerMinimized && (
        <RestTimer
          defaultSeconds={90}
          isMinimized={true}
          onToggleMinimize={() => setTimerMinimized(false)}
        />
      )}

      {/* Add Exercise Modal */}
      <Modal
        isOpen={showAddExercise}
        onClose={() => {
          setShowAddExercise(false);
          setSearchQuery('');
        }}
        title="Add Exercise"
      >
        <Input
          placeholder="Search exercises..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="mb-4"
        />
        
        <div className="max-h-[50vh] overflow-y-auto space-y-2">
          {filteredExercises.length === 0 ? (
            <p className="text-slate-400 text-center py-4">
              No exercises found. Add some in the Exercise Library.
            </p>
          ) : (
            filteredExercises.map((exercise) => (
              <button
                key={exercise.id}
                onClick={() => handleAddExercise(exercise)}
                className="w-full p-3 bg-slate-700 rounded-lg text-left hover:bg-slate-600 transition-colors"
              >
                <p className="text-white font-medium">{exercise.name}</p>
                {exercise.muscle_groups && (
                  <p className="text-slate-400 text-sm">{exercise.muscle_groups}</p>
                )}
              </button>
            ))
          )}
        </div>

        <Button
          variant="secondary"
          className="w-full mt-4"
          onClick={() => navigate('/workout/exercises')}
        >
          Manage Exercise Library
        </Button>
      </Modal>

      {/* End Workout Modal */}
      <Modal
        isOpen={showEndWorkout}
        onClose={() => setShowEndWorkout(false)}
        title="Finish Workout"
      >
        <div className="mb-4">
          <p className="text-slate-300 mb-2">Workout Summary</p>
          <div className="grid grid-cols-3 gap-4 p-4 bg-slate-700 rounded-lg">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{formatElapsedTime(elapsedTime)}</p>
              <p className="text-xs text-slate-400">Duration</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{exercisesWithSets.length}</p>
              <p className="text-xs text-slate-400">Exercises</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{totalSets}</p>
              <p className="text-xs text-slate-400">Sets</p>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-slate-400 text-sm mb-2">Notes (optional)</label>
          <textarea
            value={workoutNotes}
            onChange={(e) => setWorkoutNotes(e.target.value)}
            placeholder="How did the workout go?"
            className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 resize-none"
            rows={3}
          />
        </div>

        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setShowEndWorkout(false)}
          >
            Continue
          </Button>
          <Button
            className="flex-1"
            onClick={handleEndWorkout}
          >
            Save Workout
          </Button>
        </div>
      </Modal>

      {/* Cancel Workout Modal */}
      <Modal
        isOpen={showCancelWorkout}
        onClose={() => setShowCancelWorkout(false)}
        title="Cancel Workout?"
      >
        <p className="text-slate-300 mb-6">
          Are you sure you want to cancel this workout? All logged sets will be deleted.
        </p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setShowCancelWorkout(false)}
          >
            Keep Going
          </Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700"
            onClick={handleCancelWorkout}
          >
            <X size={18} className="mr-2" />
            Cancel Workout
          </Button>
        </div>
      </Modal>
    </div>
  );
}
