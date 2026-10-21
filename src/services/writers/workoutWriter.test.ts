import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../test/testDb';
import type { DB } from '../db';
import {
  addExercise,
  addSupersetRound,
  deleteSets,
  instantiateSession,
} from './workoutWriter';

// Real schema via the Migrations (see src/test/testDb.ts).
let pg: PGlite;
let db: DB;

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
});

afterEach(async () => {
  await pg.close();
});

async function seedProgram(): Promise<void> {
  await db.exec(`
    INSERT INTO exercises (id, name) VALUES
      (1, 'Bench Press'),
      (2, 'Overhead Press'),
      (3, 'Tricep Dips');

    INSERT INTO workout_programs (id, name, sessions_per_week)
    VALUES (1, 'Push Pull Legs', 3);

    INSERT INTO program_sessions (id, program_id, name, order_index)
    VALUES (1, 1, 'Push Day', 0);

    INSERT INTO program_exercises (session_id, exercise_id, target_sets, target_rep_min, target_rep_max, order_index, superset_group_id)
    VALUES
      (1, 1, 4, 6, 8, 0, NULL),
      (1, 2, 3, 8, 12, 1, 'ss-1'),
      (1, 3, 3, 10, 15, 2, 'ss-1');
  `);
}

async function seedWorkoutLog(): Promise<number> {
  const result = await db.query(
    `INSERT INTO workout_logs (program_id, session_id, date, started_at, status)
     VALUES (1, 1, '2025-06-01', '2025-06-01T09:00:00', 'in_progress')
     RETURNING id`,
  );
  return (result.rows as { id: number }[])[0].id;
}

describe('instantiateSession', () => {
  it('creates exercise rows from program template', async () => {
    await seedProgram();
    const workoutLogId = await seedWorkoutLog();

    const { exercises } = await instantiateSession(db, workoutLogId, 1);

    expect(exercises).toHaveLength(3);
    expect(exercises.map((e) => e.exercise_id)).toEqual([1, 2, 3]);
    expect(exercises.map((e) => e.order_index)).toEqual([0, 1, 2]);
  });

  it('preserves superset_group_id from template', async () => {
    await seedProgram();
    const workoutLogId = await seedWorkoutLog();

    const { exercises } = await instantiateSession(db, workoutLogId, 1);

    expect(exercises[0].superset_group_id).toBeNull();
    expect(exercises[1].superset_group_id).toBe('ss-1');
    expect(exercises[2].superset_group_id).toBe('ss-1');
  });

  it('pre-creates correct number of sets per exercise', async () => {
    await seedProgram();
    const workoutLogId = await seedWorkoutLog();

    const { exercises, sets } = await instantiateSession(db, workoutLogId, 1);

    // Bench Press: 4 sets, OHP: 3 sets, Dips: 3 sets = 10 total
    expect(sets).toHaveLength(10);

    const benchSets = sets.filter(
      (s) => s.workout_log_exercise_id === exercises[0].id,
    );
    expect(benchSets).toHaveLength(4);
    expect(benchSets.map((s) => s.set_number).sort()).toEqual([1, 2, 3, 4]);

    const ohpSets = sets.filter(
      (s) => s.workout_log_exercise_id === exercises[1].id,
    );
    expect(ohpSets).toHaveLength(3);
  });

  it('creates empty sets (all nullable fields are NULL)', async () => {
    await seedProgram();
    const workoutLogId = await seedWorkoutLog();

    const { sets } = await instantiateSession(db, workoutLogId, 1);

    for (const set of sets) {
      expect(set.reps).toBeNull();
      expect(set.weight_kg).toBeNull();
      expect(set.duration_seconds).toBeNull();
      expect(set.completed_at).toBeNull();
    }
  });

  it('returns empty arrays for session with no exercises', async () => {
    await seedProgram();
    // Create a session with no exercises
    await db.exec(`
      INSERT INTO program_sessions (id, program_id, name, order_index)
      VALUES (99, 1, 'Empty Session', 1);
    `);
    const workoutLogId = await seedWorkoutLog();

    const result = await instantiateSession(db, workoutLogId, 99);

    expect(result.exercises).toEqual([]);
    expect(result.sets).toEqual([]);
  });

  it('sets correct workout_log_id on all rows', async () => {
    await seedProgram();
    const workoutLogId = await seedWorkoutLog();

    const { exercises, sets } = await instantiateSession(db, workoutLogId, 1);

    for (const ex of exercises) {
      expect(ex.workout_log_id).toBe(workoutLogId);
    }
    for (const set of sets) {
      expect(set.workout_log_id).toBe(workoutLogId);
    }
  });
});

describe('addExercise', () => {
  it('creates exercise row and pre-creates sets', async () => {
    await seedProgram();
    const workoutLogId = await seedWorkoutLog();

    const { exercise, sets } = await addExercise(db, workoutLogId, 1, {
      orderIndex: 0,
      targetSets: 3,
      targetRepMin: 8,
      targetRepMax: 12,
    });

    expect(exercise.exercise_id).toBe(1);
    expect(exercise.order_index).toBe(0);
    expect(exercise.target_sets).toBe(3);

    expect(sets).toHaveLength(3);
    expect(sets.map((s) => s.set_number).sort()).toEqual([1, 2, 3]);
  });

  it('defaults to 3 sets when targetSets is not provided', async () => {
    await seedProgram();
    const workoutLogId = await seedWorkoutLog();

    const { sets } = await addExercise(db, workoutLogId, 1, {
      orderIndex: 0,
    });

    expect(sets).toHaveLength(3);
  });

  it('links sets to the correct exercise', async () => {
    await seedProgram();
    const workoutLogId = await seedWorkoutLog();

    const { exercise, sets } = await addExercise(db, workoutLogId, 2, {
      orderIndex: 1,
      targetSets: 2,
    });

    for (const set of sets) {
      expect(set.workout_log_exercise_id).toBe(exercise.id);
      expect(set.exercise_id).toBe(2);
      expect(set.workout_log_id).toBe(workoutLogId);
    }
  });

  it('preserves optional fields', async () => {
    await seedProgram();
    const workoutLogId = await seedWorkoutLog();

    const { exercise } = await addExercise(db, workoutLogId, 3, {
      orderIndex: 2,
      supersetGroupId: 'ss-1',
      targetSets: 4,
      targetDurationSeconds: 60,
      notes: 'slow negatives',
    });

    expect(exercise.superset_group_id).toBe('ss-1');
    expect(exercise.target_duration_seconds).toBe(60);
    expect(exercise.notes).toBe('slow negatives');
  });

  it('creates empty sets (nullable fields are NULL)', async () => {
    await seedProgram();
    const workoutLogId = await seedWorkoutLog();

    const { sets } = await addExercise(db, workoutLogId, 1, {
      orderIndex: 0,
      targetSets: 2,
    });

    for (const set of sets) {
      expect(set.reps).toBeNull();
      expect(set.weight_kg).toBeNull();
      expect(set.completed_at).toBeNull();
    }
  });
});

describe('deleteSets', () => {
  it('deletes the tapped set by id, not the highest, and renumbers', async () => {
    await seedProgram();
    const workoutLogId = await seedWorkoutLog();
    const { exercises, sets } = await instantiateSession(db, workoutLogId, 1);
    const bench = sets
      .filter((s) => s.workout_log_exercise_id === exercises[0].id)
      .sort((a, b) => a.set_number - b.set_number);

    await deleteSets(db, [bench[1].id]);

    const left = await db.query<{ id: number; set_number: number }>(
      `SELECT id, set_number FROM workout_sets
       WHERE workout_log_exercise_id = $1 ORDER BY set_number`,
      [exercises[0].id],
    );
    expect(left.rows.map((r) => r.id)).toEqual([
      bench[0].id,
      bench[2].id,
      bench[3].id,
    ]);
    expect(left.rows.map((r) => r.set_number)).toEqual([1, 2, 3]);
  });
});

describe('addSupersetRound', () => {
  it('adds one set per member with a shared round number', async () => {
    await seedProgram();
    const workoutLogId = await seedWorkoutLog();
    await instantiateSession(db, workoutLogId, 1);

    const added = await addSupersetRound(db, workoutLogId, 'ss-1');

    expect(added.map((s) => s.exercise_id)).toEqual([2, 3]);
    expect(added.map((s) => s.set_number)).toEqual([4, 4]);
  });
});
