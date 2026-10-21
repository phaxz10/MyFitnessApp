import type { useWorkoutPrograms } from '../../hooks/useWorkoutPrograms';
import type { ExerciseFormData, ProgramFormData } from './schema';

// Persist the editor form: create a new program, or diff an existing one
// (delete removed sessions/exercises, update kept ones, add new ones).

type ProgramsApi = Pick<
  ReturnType<typeof useWorkoutPrograms>,
  | 'getProgramById'
  | 'createProgram'
  | 'updateProgram'
  | 'addSession'
  | 'updateSession'
  | 'deleteSession'
  | 'addProgramExercise'
  | 'updateProgramExercise'
  | 'deleteProgramExercise'
>;

function exerciseFields(exercise: ExerciseFormData, orderIndex: number) {
  return {
    target_sets: exercise.targetSets,
    target_rep_min: exercise.targetRepMin ?? null,
    target_rep_max: exercise.targetRepMax ?? null,
    target_duration_seconds: exercise.targetDurationSeconds ?? null,
    superset_group_id: exercise.supersetGroupId ?? null,
    order_index: orderIndex,
    notes: exercise.notes || null,
  };
}

function parseDay(dayOfWeek: string): number | null {
  return dayOfWeek === '' ? null : parseInt(dayOfWeek, 10);
}

async function addExercises(
  api: ProgramsApi,
  sessionId: number,
  exercises: ExerciseFormData[],
) {
  for (let j = 0; j < exercises.length; j++) {
    const exercise = exercises[j];
    await api.addProgramExercise(sessionId, {
      exercise_id: exercise.exerciseId,
      ...exerciseFields(exercise, j),
    });
  }
}

/** Save the form; `programId` is the id being edited, or null to create. */
export async function saveProgram(
  api: ProgramsApi,
  data: ProgramFormData,
  programId: number | null,
): Promise<void> {
  if (programId === null) {
    // Create new program
    const newId = await api.createProgram({
      name: data.name,
      description: data.description || '',
      sessions_per_week: data.sessions.length,
    });

    // Create sessions and exercises
    for (let i = 0; i < data.sessions.length; i++) {
      const session = data.sessions[i];
      const sessionId = await api.addSession(newId, {
        name: session.name,
        day_of_week: parseDay(session.dayOfWeek),
        order_index: i,
      });
      await addExercises(api, sessionId, session.exercises);
    }
    return;
  }

  await api.updateProgram(programId, {
    name: data.name,
    description: data.description || '',
    sessions_per_week: data.sessions.length,
  });

  // Handle sessions
  const existingProgram = await api.getProgramById(programId);
  const existingSessionIds = existingProgram?.sessions.map((s) => s.id) || [];
  const currentSessionIds = data.sessions.filter((s) => s.id).map((s) => s.id!);

  // Delete removed sessions
  for (const sessionId of existingSessionIds) {
    if (!currentSessionIds.includes(sessionId)) {
      await api.deleteSession(sessionId);
    }
  }

  // Update or create sessions
  for (let i = 0; i < data.sessions.length; i++) {
    const session = data.sessions[i];
    const dayOfWeek = parseDay(session.dayOfWeek);

    if (!session.id) {
      const sessionId = await api.addSession(programId, {
        name: session.name,
        day_of_week: dayOfWeek,
        order_index: i,
      });
      // Add exercises for new session
      await addExercises(api, sessionId, session.exercises);
      continue;
    }

    await api.updateSession(session.id, {
      name: session.name,
      day_of_week: dayOfWeek,
      order_index: i,
    });
    const sessionId = session.id;

    // Handle exercises for existing session
    const existingSession = existingProgram?.sessions.find(
      (s) => s.id === session.id,
    );
    const existingExerciseIds =
      existingSession?.exercises.map((e) => e.id) || [];
    const currentExerciseIds = session.exercises
      .filter((e) => e.id)
      .map((e) => e.id!);

    // Delete removed exercises
    for (const exerciseId of existingExerciseIds) {
      if (!currentExerciseIds.includes(exerciseId)) {
        await api.deleteProgramExercise(exerciseId);
      }
    }

    // Update or create exercises
    for (let j = 0; j < session.exercises.length; j++) {
      const exercise = session.exercises[j];
      if (exercise.id) {
        await api.updateProgramExercise(
          exercise.id,
          exerciseFields(exercise, j),
        );
      } else {
        await api.addProgramExercise(sessionId, {
          exercise_id: exercise.exerciseId,
          ...exerciseFields(exercise, j),
        });
      }
    }
  }
}
