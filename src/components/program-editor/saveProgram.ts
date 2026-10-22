import type { DB } from '../../services/db';
import type { ExerciseFormData, ProgramFormData } from './schema';
import { normalizeSupersets } from './supersets';

// Persist the editor form in ONE transaction: create a new program, or diff an
// existing one against the DB (three reads, not N+1) and write only what
// changed: removed sessions/exercises deleted, changed rows updated, new rows
// inserted, unchanged rows left alone. A failure anywhere rolls it all back.

interface ExerciseRow {
  id: number;
  session_id: number;
  exercise_id: number;
  target_sets: number;
  target_rep_min: number | null;
  target_rep_max: number | null;
  target_duration_seconds: number | null;
  superset_group_id: string | null;
  order_index: number;
  notes: string | null;
}

interface SessionRow {
  id: number;
  name: string;
  day_of_week: number | null;
  order_index: number;
}

type ExerciseFields = Omit<ExerciseRow, 'id' | 'session_id'>;

const EXERCISE_COLUMNS = [
  'exercise_id',
  'target_sets',
  'target_rep_min',
  'target_rep_max',
  'target_duration_seconds',
  'superset_group_id',
  'order_index',
  'notes',
] as const satisfies readonly (keyof ExerciseFields)[];

function exerciseFields(
  exercise: ExerciseFormData,
  orderIndex: number,
): ExerciseFields {
  return {
    exercise_id: exercise.exerciseId,
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

async function insertExercise(
  tx: DB,
  sessionId: number,
  fields: ExerciseFields,
): Promise<void> {
  await tx.query(
    `INSERT INTO program_exercises (session_id, ${EXERCISE_COLUMNS.join(', ')})
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [sessionId, ...EXERCISE_COLUMNS.map((c) => fields[c])],
  );
}

async function insertSession(
  tx: DB,
  programId: number,
  session: ProgramFormData['sessions'][number],
  orderIndex: number,
): Promise<void> {
  const result = await tx.query<{ id: number }>(
    `INSERT INTO program_sessions (program_id, name, day_of_week, order_index)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [programId, session.name, parseDay(session.dayOfWeek), orderIndex],
  );
  const sessionId = result.rows[0].id;
  const exercises = normalizeSupersets(session.exercises);
  for (let j = 0; j < exercises.length; j++) {
    await insertExercise(tx, sessionId, exerciseFields(exercises[j], j));
  }
}

/**
 * Save the form; `programId` is the id being edited, or null to create (a
 * new program is made active when it is the only one). Resolves to the
 * program's id.
 */
export async function saveProgram(
  db: DB,
  data: ProgramFormData,
  programId: number | null,
): Promise<number> {
  return db.transaction(async (tx) => {
    const program = {
      name: data.name,
      description: data.description || '',
      sessions_per_week: data.sessions.length,
    };

    if (programId === null) {
      // The first program becomes the active one: nothing else to schedule.
      const result = await tx.query<{ id: number }>(
        `INSERT INTO workout_programs (name, description, sessions_per_week, is_active)
         VALUES ($1, $2, $3, NOT EXISTS (SELECT 1 FROM workout_programs)) RETURNING id`,
        [program.name, program.description, program.sessions_per_week],
      );
      const newId = result.rows[0].id;
      for (let i = 0; i < data.sessions.length; i++) {
        await insertSession(tx, newId, data.sessions[i], i);
      }
      return newId;
    }

    const [programRow, sessionRows, exerciseRows] = await Promise.all([
      tx.query<typeof program>(
        'SELECT name, description, sessions_per_week FROM workout_programs WHERE id = $1',
        [programId],
      ),
      tx.query<SessionRow>(
        'SELECT id, name, day_of_week, order_index FROM program_sessions WHERE program_id = $1',
        [programId],
      ),
      tx.query<ExerciseRow>(
        `SELECT pe.* FROM program_exercises pe
         JOIN program_sessions ps ON ps.id = pe.session_id
         WHERE ps.program_id = $1`,
        [programId],
      ),
    ]);

    const current = programRow.rows[0];
    if (
      !current ||
      current.name !== program.name ||
      (current.description ?? '') !== program.description ||
      current.sessions_per_week !== program.sessions_per_week
    ) {
      await tx.query(
        `UPDATE workout_programs
         SET name = $1, description = $2, sessions_per_week = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [
          program.name,
          program.description,
          program.sessions_per_week,
          programId,
        ],
      );
    }

    // Removed sessions (their exercises cascade) and removed exercises.
    const keptSessionIds = new Set(
      data.sessions.flatMap((s) => (s.id ? [s.id] : [])),
    );
    const keptExerciseIds = new Set(
      data.sessions.flatMap((s) =>
        s.exercises.flatMap((e) => (e.id ? [e.id] : [])),
      ),
    );
    const removedSessions = sessionRows.rows
      .filter((s) => !keptSessionIds.has(s.id))
      .map((s) => s.id);
    const removedExercises = exerciseRows.rows
      .filter(
        (e) => keptSessionIds.has(e.session_id) && !keptExerciseIds.has(e.id),
      )
      .map((e) => e.id);
    if (removedSessions.length > 0) {
      await tx.query('DELETE FROM program_sessions WHERE id = ANY($1::int[])', [
        removedSessions,
      ]);
    }
    if (removedExercises.length > 0) {
      await tx.query(
        'DELETE FROM program_exercises WHERE id = ANY($1::int[])',
        [removedExercises],
      );
    }

    const sessionsById = new Map(sessionRows.rows.map((s) => [s.id, s]));
    const exercisesById = new Map(exerciseRows.rows.map((e) => [e.id, e]));

    for (let i = 0; i < data.sessions.length; i++) {
      const session = data.sessions[i];
      const existing = session.id ? sessionsById.get(session.id) : undefined;
      if (!existing) {
        await insertSession(tx, programId, session, i);
        continue;
      }

      const dayOfWeek = parseDay(session.dayOfWeek);
      if (
        existing.name !== session.name ||
        existing.day_of_week !== dayOfWeek ||
        existing.order_index !== i
      ) {
        await tx.query(
          'UPDATE program_sessions SET name = $1, day_of_week = $2, order_index = $3 WHERE id = $4',
          [session.name, dayOfWeek, i, existing.id],
        );
      }

      const exercises = normalizeSupersets(session.exercises);
      for (let j = 0; j < exercises.length; j++) {
        const fields = exerciseFields(exercises[j], j);
        const row = exercises[j].id
          ? exercisesById.get(exercises[j].id!)
          : undefined;
        if (!row) {
          await insertExercise(tx, existing.id, fields);
          continue;
        }
        const changed = EXERCISE_COLUMNS.filter((c) => row[c] !== fields[c]);
        if (changed.length > 0) {
          await tx.query(
            `UPDATE program_exercises SET ${changed
              .map((c, k) => `${c} = $${k + 1}`)
              .join(', ')} WHERE id = $${changed.length + 1}`,
            [...changed.map((c) => fields[c]), row.id],
          );
        }
      }
    }
    return programId;
  });
}
