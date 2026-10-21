import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type DB, onDbWrite, type WriteEvent } from '../../services/db';
import { createTestDb } from '../../test/testDb';
import type { WorkoutProgramWithSessions } from '../../types';
import type { ProgramFormData } from './schema';

// The hooks' React use is stubbed (node env, no DOM harness).
vi.mock('react', () => ({
  useCallback: <T>(fn: T) => fn,
  useState: (init: unknown) => [init, () => {}],
}));

let pg: PGlite;
let db: DB;
vi.mock('../../services/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/db')>()),
  getDB: async () => db,
}));

// Aliased: with React stubbed this is a plain function, called once below.
const { useWorkoutPrograms: programsHook } = await import(
  '../../hooks/useWorkoutPrograms'
);
const { saveProgram } = await import('./saveProgram');
const programsApi = programsHook();

let events: WriteEvent[] = [];
onDbWrite((e) => events.push(e));
const flush = () => new Promise((r) => setTimeout(r, 0));

const save = (data: ProgramFormData) => saveProgram(db, data, 1);

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
  await pg.exec(`
    INSERT INTO exercises (id, name) VALUES (1, 'Bench'), (2, 'Row'), (3, 'Squat'), (4, 'Curl');
    INSERT INTO workout_programs (id, name, description, sessions_per_week) VALUES (1, 'PPL', '', 2);
    INSERT INTO program_sessions (id, program_id, name, day_of_week, order_index)
      VALUES (1, 1, 'Upper', 1, 0), (2, 1, 'Lower', 3, 1);
    INSERT INTO program_exercises (id, session_id, exercise_id, target_sets, target_rep_min, target_rep_max, order_index, notes)
      VALUES (1, 1, 1, 3, 8, 12, 0, NULL), (2, 1, 2, 3, 8, 12, 1, NULL),
             (3, 2, 3, 5, 5, 5, 0, NULL), (4, 2, 4, 3, 10, 15, 1, NULL);
    -- explicit ids above; move the sequences past them
    SELECT setval('workout_programs_id_seq', 100);
    SELECT setval('program_sessions_id_seq', 100);
    SELECT setval('program_exercises_id_seq', 100);
  `);
  events = [];
});

afterEach(async () => {
  await pg.close();
});

// What ProgramEditor.loadProgram puts in the form.
async function loadForm(): Promise<ProgramFormData> {
  const program = (await programsApi.getProgramById(
    1,
  )) as WorkoutProgramWithSessions;
  events = [];
  return {
    name: program.name,
    description: program.description || '',
    sessions: program.sessions.map((session) => ({
      id: session.id,
      name: session.name,
      dayOfWeek: session.day_of_week?.toString() ?? '',
      isExpanded: true,
      exercises: session.exercises.map((ex) => ({
        id: ex.id,
        exerciseId: ex.exercise_id,
        exerciseName: ex.exercise_name,
        exerciseType: ex.exercise_type || 'reps_weight',
        targetSets: ex.target_sets,
        targetRepMin: ex.target_rep_min,
        targetRepMax: ex.target_rep_max,
        targetDurationSeconds: ex.target_duration_seconds,
        supersetGroupId: ex.superset_group_id,
        notes: ex.notes || '',
      })),
    })),
  };
}

const writes = async () => {
  await flush();
  return events;
};

describe('saveProgram', () => {
  it('writes nothing when nothing changed', async () => {
    const form = await loadForm();
    await save(form);
    expect(await writes()).toEqual([]);
  });

  it('writes only the row that changed', async () => {
    const form = await loadForm();
    form.sessions[1].exercises[0].targetSets = 4;
    await save(form);
    expect(await writes()).toEqual([
      { table: 'program_exercises', op: 'update' },
    ]);
    const row = await pg.query<{ target_sets: number }>(
      'SELECT target_sets FROM program_exercises WHERE id = 3',
    );
    expect(row.rows[0].target_sets).toBe(4);
  });

  it('is all-or-nothing: a failing row leaves the program untouched', async () => {
    const form = await loadForm();
    form.name = 'Renamed';
    form.sessions[0].exercises.push({
      ...form.sessions[0].exercises[0],
      id: undefined,
      exerciseId: 999, // no such exercise: FK violation
    });
    await expect(save(form)).rejects.toThrow();
    const program = await pg.query<{ name: string }>(
      'SELECT name FROM workout_programs WHERE id = 1',
    );
    expect(program.rows[0].name).toBe('PPL');
  });

  it('saves superset members next to each other', async () => {
    const form = await loadForm();
    const [bench, row] = form.sessions[0].exercises;
    form.sessions[0].exercises = [
      { ...bench, supersetGroupId: 'ss-1' },
      row,
      {
        ...row,
        id: undefined,
        exerciseId: 4,
        exerciseName: 'Curl',
        supersetGroupId: 'ss-1',
      },
    ];
    await save(form);
    const rows = await pg.query<{ exercise_id: number }>(
      'SELECT exercise_id FROM program_exercises WHERE session_id = 1 ORDER BY order_index',
    );
    expect(rows.rows.map((r) => r.exercise_id)).toEqual([1, 4, 2]);
  });

  it('creates a new program with its sessions and exercises', async () => {
    const form = await loadForm();
    form.name = 'Copy';
    for (const session of form.sessions) {
      session.id = undefined;
      for (const e of session.exercises) e.id = undefined;
    }
    const newId = await saveProgram(db, form, null);
    const rows = await pg.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM program_exercises pe
       JOIN program_sessions ps ON ps.id = pe.session_id WHERE ps.program_id = $1`,
      [newId],
    );
    expect(rows.rows[0].n).toBe(4);
  });
});
