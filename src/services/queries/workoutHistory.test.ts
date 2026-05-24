import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inRange, recent } from './workoutHistory';

// ---------------------------------------------------------------------------
// Test-only schema (subset needed by the queries)
// ---------------------------------------------------------------------------

const SCHEMA = `
  CREATE TABLE workout_programs (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    sessions_per_week INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE program_sessions (
    id SERIAL PRIMARY KEY,
    program_id INTEGER NOT NULL REFERENCES workout_programs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    day_of_week INTEGER,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE exercises (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    muscle_groups TEXT,
    equipment TEXT,
    video_url TEXT,
    exercise_type TEXT NOT NULL DEFAULT 'reps_weight',
    is_ai_generated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE workout_logs (
    id SERIAL PRIMARY KEY,
    program_id INTEGER REFERENCES workout_programs(id) ON DELETE SET NULL,
    session_id INTEGER REFERENCES program_sessions(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    started_at TIMESTAMP NOT NULL,
    ended_at TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'in_progress',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE workout_log_exercises (
    id SERIAL PRIMARY KEY,
    workout_log_id INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL,
    superset_group_id TEXT,
    target_sets INTEGER,
    target_rep_min INTEGER,
    target_rep_max INTEGER,
    target_duration_seconds INTEGER,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE workout_sets (
    id SERIAL PRIMARY KEY,
    workout_log_id INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    workout_log_exercise_id INTEGER REFERENCES workout_log_exercises(id) ON DELETE CASCADE,
    set_number INTEGER NOT NULL,
    reps INTEGER,
    weight_kg REAL,
    duration_seconds INTEGER,
    notes TEXT,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function seedDb(db: PGlite): Promise<void> {
  await db.exec(SCHEMA);

  // Create an exercise
  await db.exec(`
    INSERT INTO exercises (id, name, muscle_groups, equipment)
    VALUES (1, 'Bench Press', 'Chest', 'Barbell');
  `);

  // Create a program + session
  await db.exec(`
    INSERT INTO workout_programs (id, name, sessions_per_week)
    VALUES (1, 'Push Pull Legs', 3);

    INSERT INTO program_sessions (id, program_id, name, order_index)
    VALUES (1, 1, 'Push Day', 0);
  `);

  // Log 1: completed, with program, 2 sets
  await db.exec(`
    INSERT INTO workout_logs (id, program_id, session_id, date, started_at, ended_at, status)
    VALUES (1, 1, 1, '2025-05-20', '2025-05-20T09:00:00', '2025-05-20T10:00:00', 'completed');

    INSERT INTO workout_sets (workout_log_id, exercise_id, set_number, reps, weight_kg, completed_at)
    VALUES
      (1, 1, 1, 8, 60, '2025-05-20T09:10:00'),
      (1, 1, 2, 6, 65, '2025-05-20T09:15:00');
  `);

  // Log 2: completed, no program, 1 set
  await db.exec(`
    INSERT INTO workout_logs (id, date, started_at, ended_at, status)
    VALUES (2, '2025-05-21', '2025-05-21T08:00:00', '2025-05-21T09:00:00', 'completed');

    INSERT INTO workout_sets (workout_log_id, exercise_id, set_number, reps, weight_kg, completed_at)
    VALUES (2, 1, 1, 10, 55, '2025-05-21T08:30:00');
  `);

  // Log 3: in_progress, no sets
  await db.exec(`
    INSERT INTO workout_logs (id, date, started_at, status)
    VALUES (3, '2025-05-22', '2025-05-22T07:00:00', 'in_progress');
  `);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await seedDb(db);
});

afterEach(async () => {
  await db.close();
});

describe('workoutHistory.recent', () => {
  it('returns logs in reverse-chronological order with nested sets', async () => {
    const logs = await recent(db, 10);

    expect(logs).toHaveLength(3);
    // Most recent first
    expect(logs[0].id).toBe(3);
    expect(logs[1].id).toBe(2);
    expect(logs[2].id).toBe(1);
  });

  it('nests sets as an array inside each log', async () => {
    const logs = await recent(db, 10);

    // Log 3 has no sets
    expect(logs[0].sets).toEqual([]);

    // Log 2 has 1 set
    expect(logs[1].sets).toHaveLength(1);
    expect(logs[1].sets[0].reps).toBe(10);
    expect(logs[1].sets[0].weight_kg).toBe(55);

    // Log 1 has 2 sets
    expect(logs[2].sets).toHaveLength(2);
    expect(logs[2].sets[0].set_number).toBe(1);
    expect(logs[2].sets[1].set_number).toBe(2);
  });

  it('includes exercise_name in each set', async () => {
    const logs = await recent(db, 10);
    const setWithExercise = logs[2].sets[0];
    expect(setWithExercise.exercise_name).toBe('Bench Press');
  });

  it('includes session_name and program_name from joins', async () => {
    const logs = await recent(db, 10);
    const programLog = logs.find((l) => l.id === 1)!;
    expect(programLog.session_name).toBe('Push Day');
    expect(programLog.program_name).toBe('Push Pull Legs');
  });

  it('returns null/undefined for session_name when no program', async () => {
    const logs = await recent(db, 10);
    const adHocLog = logs.find((l) => l.id === 2)!;
    // session_name should be null or undefined for ad-hoc workouts
    expect(adHocLog.session_name).toBeFalsy();
  });

  it('respects the limit parameter', async () => {
    const logs = await recent(db, 2);
    expect(logs).toHaveLength(2);
    // Should be the 2 most recent
    expect(logs[0].id).toBe(3);
    expect(logs[1].id).toBe(2);
  });
});

describe('workoutHistory.inRange', () => {
  it('returns only logs within the date range', async () => {
    const logs = await inRange(db, '2025-05-21', '2025-05-22');

    expect(logs).toHaveLength(2);
    expect(logs.map((l) => l.id).sort()).toEqual([2, 3]);
  });

  it('includes sets for logs within range', async () => {
    const logs = await inRange(db, '2025-05-20', '2025-05-20');

    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBe(1);
    expect(logs[0].sets).toHaveLength(2);
  });

  it('returns empty array when no logs in range', async () => {
    const logs = await inRange(db, '2025-01-01', '2025-01-02');
    expect(logs).toEqual([]);
  });
});
