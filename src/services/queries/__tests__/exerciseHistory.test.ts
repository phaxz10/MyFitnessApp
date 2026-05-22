import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sessions } from '../exerciseHistory';

// ---------------------------------------------------------------------------
// Test-only schema (subset needed by the queries)
// ---------------------------------------------------------------------------

const SCHEMA = `
  CREATE TABLE exercises (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    muscle_groups TEXT,
    equipment TEXT,
    exercise_type TEXT NOT NULL DEFAULT 'reps_weight',
    is_ai_generated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE workout_logs (
    id SERIAL PRIMARY KEY,
    program_id INTEGER,
    session_id INTEGER,
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

  // Two exercises
  await db.exec(`
    INSERT INTO exercises (id, name, muscle_groups, equipment)
    VALUES
      (1, 'Bench Press', 'Chest', 'Barbell'),
      (2, 'Squat', 'Legs', 'Barbell');
  `);

  // Workout 1 — completed, has bench press (2 completed sets) + squat (1 completed set)
  await db.exec(`
    INSERT INTO workout_logs (id, date, started_at, ended_at, status)
    VALUES (1, '2025-05-18', '2025-05-18T09:00:00', '2025-05-18T10:00:00', 'completed');

    INSERT INTO workout_sets (workout_log_id, exercise_id, set_number, reps, weight_kg, completed_at)
    VALUES
      (1, 1, 1, 8, 60, '2025-05-18T09:10:00'),
      (1, 1, 2, 6, 65, '2025-05-18T09:15:00'),
      (1, 2, 1, 5, 100, '2025-05-18T09:30:00');
  `);

  // Workout 2 — completed, bench press only (3 completed sets)
  await db.exec(`
    INSERT INTO workout_logs (id, date, started_at, ended_at, status)
    VALUES (2, '2025-05-20', '2025-05-20T09:00:00', '2025-05-20T10:00:00', 'completed');

    INSERT INTO workout_sets (workout_log_id, exercise_id, set_number, reps, weight_kg, completed_at)
    VALUES
      (2, 1, 1, 8, 62.5, '2025-05-20T09:10:00'),
      (2, 1, 2, 7, 62.5, '2025-05-20T09:15:00'),
      (2, 1, 3, 6, 62.5, '2025-05-20T09:20:00');
  `);

  // Workout 3 — in_progress, bench press with 1 completed set + 1 uncompleted set
  await db.exec(`
    INSERT INTO workout_logs (id, date, started_at, status)
    VALUES (3, '2025-05-22', '2025-05-22T09:00:00', 'in_progress');

    INSERT INTO workout_sets (workout_log_id, exercise_id, set_number, reps, weight_kg, completed_at)
    VALUES
      (3, 1, 1, 8, 65, '2025-05-22T09:10:00'),
      (3, 1, 2, NULL, NULL, NULL);
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

describe('exerciseHistory.sessions', () => {
  it('returns all sessions for an exercise in reverse-chronological order', async () => {
    const result = await sessions(db, 1); // Bench Press

    expect(result).toHaveLength(3);
    expect(result[0].workoutLogId).toBe(3); // most recent first
    expect(result[1].workoutLogId).toBe(2);
    expect(result[2].workoutLogId).toBe(1);
  });

  it('nests sets inside each session', async () => {
    const result = await sessions(db, 1);

    // Workout 3: 2 sets (1 completed, 1 not)
    expect(result[0].sets).toHaveLength(2);

    // Workout 2: 3 sets
    expect(result[1].sets).toHaveLength(3);
    expect(result[1].sets[0].reps).toBe(8);
    expect(result[1].sets[0].weight_kg).toBe(62.5);

    // Workout 1: 2 bench press sets
    expect(result[2].sets).toHaveLength(2);
  });

  it('only returns sessions for the requested exercise', async () => {
    const squat = await sessions(db, 2); // Squat

    expect(squat).toHaveLength(1);
    expect(squat[0].workoutLogId).toBe(1);
    expect(squat[0].sets).toHaveLength(1);
    expect(squat[0].sets[0].weight_kg).toBe(100);
  });

  it('returns empty array for an exercise with no history', async () => {
    const result = await sessions(db, 999);
    expect(result).toEqual([]);
  });

  it('respects the limit option', async () => {
    const result = await sessions(db, 1, { limit: 2 });

    expect(result).toHaveLength(2);
    // Most recent 2
    expect(result[0].workoutLogId).toBe(3);
    expect(result[1].workoutLogId).toBe(2);
  });

  describe('completedSetsOnly option', () => {
    it('only includes sets with completed_at IS NOT NULL', async () => {
      const result = await sessions(db, 1, { completedSetsOnly: true });

      // Workout 3 has 1 completed set (the uncompleted one is filtered out)
      const workout3 = result.find((s) => s.workoutLogId === 3);
      expect(workout3).toBeDefined();
      expect(workout3!.sets).toHaveLength(1);
      expect(workout3!.sets[0].reps).toBe(8);
    });
  });

  describe('completedWorkoutsOnly option', () => {
    it('only includes sessions from completed workouts', async () => {
      const result = await sessions(db, 1, { completedWorkoutsOnly: true });

      // Workout 3 is in_progress, so excluded
      expect(result).toHaveLength(2);
      expect(result[0].workoutLogId).toBe(2);
      expect(result[1].workoutLogId).toBe(1);
    });

    it('includes ALL sets (even uncompleted) from completed workouts', async () => {
      // Add an uncompleted set to completed workout 2
      await db.exec(`
        INSERT INTO workout_sets (workout_log_id, exercise_id, set_number, reps, weight_kg, completed_at)
        VALUES (2, 1, 4, NULL, NULL, NULL);
      `);

      const result = await sessions(db, 1, { completedWorkoutsOnly: true });
      const workout2 = result.find((s) => s.workoutLogId === 2)!;
      // All 4 sets included (3 original + 1 uncompleted)
      expect(workout2.sets).toHaveLength(4);
    });
  });

  describe('excludeWorkoutLogId option', () => {
    it('excludes the specified workout log', async () => {
      const result = await sessions(db, 1, { excludeWorkoutLogId: 3 });

      expect(result).toHaveLength(2);
      expect(result.find((s) => s.workoutLogId === 3)).toBeUndefined();
    });
  });

  describe('combined options — getLastPerformance adapter', () => {
    it('returns last completed performance excluding current workout', async () => {
      // This is the exact call pattern for getLastPerformance
      const result = await sessions(db, 1, {
        completedSetsOnly: true,
        limit: 1,
        excludeWorkoutLogId: 3,
      });

      // Should return workout 2 (most recent completed, excluding 3)
      expect(result).toHaveLength(1);
      expect(result[0].workoutLogId).toBe(2);
      expect(result[0].sets).toHaveLength(3);
    });

    it('returns empty for exercise with no completed history', async () => {
      const result = await sessions(db, 2, {
        completedSetsOnly: true,
        limit: 1,
        excludeWorkoutLogId: 1,
      });

      expect(result).toEqual([]);
    });
  });

  describe('combined options — getRecentExerciseHistoryBySession adapter', () => {
    it('returns recent completed workout sessions for coaching', async () => {
      // This is the exact call pattern for getRecentExerciseHistoryBySession
      const result = await sessions(db, 1, {
        completedWorkoutsOnly: true,
        limit: 5,
      });

      // Workout 3 excluded (in_progress), workouts 1 and 2 included
      expect(result).toHaveLength(2);

      // Reverse for chronological order (like the original function)
      const chronological = result
        .map(({ date, sets }) => ({ date, sets }))
        .reverse();

      expect(chronological[0].date).toContain('2025-05-18');
      expect(chronological[1].date).toContain('2025-05-20');
    });
  });
});
