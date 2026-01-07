import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft,
  Plus, 
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Save,
  X
} from 'lucide-react';
import { Card, CardContent, Button, Input, Modal, TextArea } from '../components/ui';
import { useWorkoutPrograms } from '../hooks/useWorkoutPrograms';
import { useExercises } from '../hooks/useExercises';
import type { Exercise } from '../types';

const DAY_OPTIONS = [
  { value: null, label: 'Any Day' },
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

interface SessionFormData {
  id?: number;
  name: string;
  day_of_week: number | null;
  order_index: number;
  exercises: ExerciseFormData[];
  isExpanded: boolean;
}

interface ExerciseFormData {
  id?: number;
  exercise_id: number;
  exercise_name: string;
  target_sets: number;
  target_rep_min: number;
  target_rep_max: number;
  order_index: number;
  notes: string;
}

export function ProgramEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = !!id && id !== 'new';

  const { 
    getProgramById,
    createProgram,
    updateProgram,
    addSession,
    updateSession,
    deleteSession,
    addProgramExercise,
    updateProgramExercise,
    deleteProgramExercise,
    loading 
  } = useWorkoutPrograms();
  const { exercises: allExercises, fetchExercises } = useExercises();

  const [programName, setProgramName] = useState('');
  const [programDescription, setProgramDescription] = useState('');
  const [sessions, setSessions] = useState<SessionFormData[]>([]);
  const [showAddExercise, setShowAddExercise] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);

  useEffect(() => {
    fetchExercises();
    
    if (isEditing) {
      loadProgram(parseInt(id));
    }
  }, [id, isEditing, fetchExercises]);

  const loadProgram = async (programId: number) => {
    const program = await getProgramById(programId);
    if (program) {
      setProgramName(program.name);
      setProgramDescription(program.description || '');
      setSessions(program.sessions.map(session => ({
        id: session.id,
        name: session.name,
        day_of_week: session.day_of_week,
        order_index: session.order_index,
        exercises: session.exercises.map(ex => ({
          id: ex.id,
          exercise_id: ex.exercise_id,
          exercise_name: ex.exercise_name,
          target_sets: ex.target_sets,
          target_rep_min: ex.target_rep_min,
          target_rep_max: ex.target_rep_max,
          order_index: ex.order_index,
          notes: ex.notes || '',
        })),
        isExpanded: true,
      })));
    }
  };

  const handleBack = () => {
    if (hasChanges) {
      setShowDiscardModal(true);
    } else {
      navigate('/workout');
    }
  };

  const handleAddSession = () => {
    const newSession: SessionFormData = {
      name: `Session ${sessions.length + 1}`,
      day_of_week: null,
      order_index: sessions.length,
      exercises: [],
      isExpanded: true,
    };
    setSessions([...sessions, newSession]);
    setHasChanges(true);
  };

  const handleUpdateSession = (index: number, updates: Partial<SessionFormData>) => {
    setSessions(prev => prev.map((s, i) => 
      i === index ? { ...s, ...updates } : s
    ));
    setHasChanges(true);
  };

  const handleDeleteSession = (index: number) => {
    setSessions(prev => prev.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const handleAddExercise = (sessionIndex: number, exercise: Exercise) => {
    const newExercise: ExerciseFormData = {
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      target_sets: 3,
      target_rep_min: 8,
      target_rep_max: 12,
      order_index: sessions[sessionIndex].exercises.length,
      notes: '',
    };

    setSessions(prev => prev.map((s, i) => 
      i === sessionIndex 
        ? { ...s, exercises: [...s.exercises, newExercise] }
        : s
    ));
    setShowAddExercise(null);
    setSearchQuery('');
    setHasChanges(true);
  };

  const handleUpdateExercise = (
    sessionIndex: number, 
    exerciseIndex: number, 
    updates: Partial<ExerciseFormData>
  ) => {
    setSessions(prev => prev.map((s, i) => 
      i === sessionIndex 
        ? { 
            ...s, 
            exercises: s.exercises.map((ex, j) => 
              j === exerciseIndex ? { ...ex, ...updates } : ex
            )
          }
        : s
    ));
    setHasChanges(true);
  };

  const handleDeleteExercise = (sessionIndex: number, exerciseIndex: number) => {
    setSessions(prev => prev.map((s, i) => 
      i === sessionIndex 
        ? { ...s, exercises: s.exercises.filter((_, j) => j !== exerciseIndex) }
        : s
    ));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!programName.trim()) {
      alert('Please enter a program name');
      return;
    }

    if (sessions.length === 0) {
      alert('Please add at least one session');
      return;
    }

    try {
      let programId: number;

      if (isEditing) {
        programId = parseInt(id);
        await updateProgram(programId, {
          name: programName,
          description: programDescription,
          sessions_per_week: sessions.length,
        });

        // Handle sessions
        const existingProgram = await getProgramById(programId);
        const existingSessionIds = existingProgram?.sessions.map(s => s.id) || [];
        const currentSessionIds = sessions.filter(s => s.id).map(s => s.id!);

        // Delete removed sessions
        for (const sessionId of existingSessionIds) {
          if (!currentSessionIds.includes(sessionId)) {
            await deleteSession(sessionId);
          }
        }

        // Update or create sessions
        for (let i = 0; i < sessions.length; i++) {
          const session = sessions[i];
          let sessionId: number;

          if (session.id) {
            await updateSession(session.id, {
              name: session.name,
              day_of_week: session.day_of_week,
              order_index: i,
            });
            sessionId = session.id;

            // Handle exercises for existing session
            const existingSession = existingProgram?.sessions.find(s => s.id === session.id);
            const existingExerciseIds = existingSession?.exercises.map(e => e.id) || [];
            const currentExerciseIds = session.exercises.filter(e => e.id).map(e => e.id!);

            // Delete removed exercises
            for (const exerciseId of existingExerciseIds) {
              if (!currentExerciseIds.includes(exerciseId)) {
                await deleteProgramExercise(exerciseId);
              }
            }

            // Update or create exercises
            for (let j = 0; j < session.exercises.length; j++) {
              const exercise = session.exercises[j];
              if (exercise.id) {
                await updateProgramExercise(exercise.id, {
                  target_sets: exercise.target_sets,
                  target_rep_min: exercise.target_rep_min,
                  target_rep_max: exercise.target_rep_max,
                  order_index: j,
                  notes: exercise.notes || null,
                });
              } else {
                await addProgramExercise(sessionId, {
                  exercise_id: exercise.exercise_id,
                  target_sets: exercise.target_sets,
                  target_rep_min: exercise.target_rep_min,
                  target_rep_max: exercise.target_rep_max,
                  order_index: j,
                  notes: exercise.notes || null,
                });
              }
            }
          } else {
            sessionId = await addSession(programId, {
              name: session.name,
              day_of_week: session.day_of_week,
              order_index: i,
            });

            // Add exercises for new session
            for (let j = 0; j < session.exercises.length; j++) {
              const exercise = session.exercises[j];
              await addProgramExercise(sessionId, {
                exercise_id: exercise.exercise_id,
                target_sets: exercise.target_sets,
                target_rep_min: exercise.target_rep_min,
                target_rep_max: exercise.target_rep_max,
                order_index: j,
                notes: exercise.notes || null,
              });
            }
          }
        }
      } else {
        // Create new program
        programId = await createProgram({
          name: programName,
          description: programDescription,
          sessions_per_week: sessions.length,
        });

        // Create sessions and exercises
        for (let i = 0; i < sessions.length; i++) {
          const session = sessions[i];
          const sessionId = await addSession(programId, {
            name: session.name,
            day_of_week: session.day_of_week,
            order_index: i,
          });

          for (let j = 0; j < session.exercises.length; j++) {
            const exercise = session.exercises[j];
            await addProgramExercise(sessionId, {
              exercise_id: exercise.exercise_id,
              target_sets: exercise.target_sets,
              target_rep_min: exercise.target_rep_min,
              target_rep_max: exercise.target_rep_max,
              order_index: j,
              notes: exercise.notes || null,
            });
          }
        }
      }

      navigate('/workout');
    } catch (err) {
      console.error('Failed to save program:', err);
      alert('Failed to save program');
    }
  };

  const filteredExercises = allExercises.filter(ex => 
    ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ex.muscle_groups?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={handleBack} className="p-2 text-slate-400 hover:text-white">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold text-white">
          {isEditing ? 'Edit Program' : 'New Program'}
        </h1>
      </div>

      {/* Program Info */}
      <Card className="mb-4">
        <CardContent className="p-4 space-y-4">
          <div>
            <label className="block text-slate-400 text-sm mb-1">Program Name</label>
            <Input
              value={programName}
              onChange={(e) => {
                setProgramName(e.target.value);
                setHasChanges(true);
              }}
              placeholder="e.g., Push Pull Legs"
            />
          </div>
          <div>
            <label className="block text-slate-400 text-sm mb-1">Description (optional)</label>
            <TextArea
              value={programDescription}
              onChange={(e) => {
                setProgramDescription(e.target.value);
                setHasChanges(true);
              }}
              placeholder="Describe your program..."
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Sessions */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold text-white">Sessions</h2>
          <span className="text-slate-400 text-sm">{sessions.length} sessions/week</span>
        </div>

        {sessions.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-slate-400 mb-4">No sessions yet</p>
              <Button onClick={handleAddSession}>
                <Plus size={18} className="mr-2" />
                Add Session
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.map((session, sessionIndex) => (
              <Card key={sessionIndex}>
                <CardContent className="p-4">
                  {/* Session Header */}
                  <div className="flex items-center gap-2 mb-3">
                    <GripVertical size={18} className="text-slate-500" />
                    <Input
                      value={session.name}
                      onChange={(e) => handleUpdateSession(sessionIndex, { name: e.target.value })}
                      className="flex-1"
                      placeholder="Session name"
                    />
                    <select
                      value={session.day_of_week ?? ''}
                      onChange={(e) => handleUpdateSession(sessionIndex, { 
                        day_of_week: e.target.value === '' ? null : parseInt(e.target.value)
                      })}
                      className="bg-slate-700 text-white rounded-lg px-3 py-2 text-sm"
                    >
                      {DAY_OPTIONS.map(opt => (
                        <option key={opt.label} value={opt.value ?? ''}>{opt.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleUpdateSession(sessionIndex, { isExpanded: !session.isExpanded })}
                      className="p-2 text-slate-400 hover:text-white"
                    >
                      {session.isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                    <button
                      onClick={() => handleDeleteSession(sessionIndex)}
                      className="p-2 text-red-400 hover:text-red-300"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  {/* Exercises */}
                  {session.isExpanded && (
                    <div className="space-y-2 ml-6">
                      {session.exercises.length === 0 ? (
                        <p className="text-slate-500 text-sm py-2">No exercises added</p>
                      ) : (
                        session.exercises.map((exercise, exerciseIndex) => (
                          <div 
                            key={exerciseIndex}
                            className="flex items-center gap-2 p-2 bg-slate-700/50 rounded-lg"
                          >
                            <GripVertical size={16} className="text-slate-500" />
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm truncate">{exercise.exercise_name}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                value={exercise.target_sets}
                                onChange={(e) => handleUpdateExercise(sessionIndex, exerciseIndex, {
                                  target_sets: parseInt(e.target.value) || 1
                                })}
                                className="w-12 text-center p-1 h-8 text-sm"
                                min={1}
                              />
                              <span className="text-slate-400 text-sm">×</span>
                              <Input
                                type="number"
                                value={exercise.target_rep_min}
                                onChange={(e) => handleUpdateExercise(sessionIndex, exerciseIndex, {
                                  target_rep_min: parseInt(e.target.value) || 1
                                })}
                                className="w-12 text-center p-1 h-8 text-sm"
                                min={1}
                              />
                              <span className="text-slate-400 text-sm">-</span>
                              <Input
                                type="number"
                                value={exercise.target_rep_max}
                                onChange={(e) => handleUpdateExercise(sessionIndex, exerciseIndex, {
                                  target_rep_max: parseInt(e.target.value) || 1
                                })}
                                className="w-12 text-center p-1 h-8 text-sm"
                                min={1}
                              />
                            </div>
                            <button
                              onClick={() => handleDeleteExercise(sessionIndex, exerciseIndex)}
                              className="p-1 text-red-400 hover:text-red-300"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))
                      )}

                      <button
                        onClick={() => setShowAddExercise(sessionIndex)}
                        className="w-full p-2 border border-dashed border-slate-600 rounded-lg text-slate-400 hover:text-white hover:border-slate-500 flex items-center justify-center gap-2"
                      >
                        <Plus size={16} />
                        Add Exercise
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            <Button 
              variant="secondary" 
              className="w-full"
              onClick={handleAddSession}
            >
              <Plus size={18} className="mr-2" />
              Add Session
            </Button>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="fixed bottom-20 left-0 right-0 p-4 bg-gradient-to-t from-slate-900 to-transparent">
        <Button 
          className="w-full max-w-lg mx-auto block"
          onClick={handleSave}
          disabled={loading || !programName.trim()}
        >
          <Save size={18} className="mr-2" />
          {isEditing ? 'Save Changes' : 'Create Program'}
        </Button>
      </div>

      {/* Add Exercise Modal */}
      <Modal
        isOpen={showAddExercise !== null}
        onClose={() => {
          setShowAddExercise(null);
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
                onClick={() => showAddExercise !== null && handleAddExercise(showAddExercise, exercise)}
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

      {/* Discard Changes Modal */}
      <Modal
        isOpen={showDiscardModal}
        onClose={() => setShowDiscardModal(false)}
        title="Discard Changes?"
      >
        <p className="text-slate-300 mb-6">
          You have unsaved changes. Are you sure you want to discard them?
        </p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setShowDiscardModal(false)}
          >
            Keep Editing
          </Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700"
            onClick={() => navigate('/workout')}
          >
            Discard
          </Button>
        </div>
      </Modal>
    </div>
  );
}
