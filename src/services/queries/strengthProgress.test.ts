import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../test/testDb';
import type {
  ExercisePR,
  ExerciseProgressSummary,
  ExerciseType,
  PersonalRecord,
  ProgressTrend,
} from '../../types';
import { formatDate } from '../../utils/date';
import { pgDate } from '../../utils/pgValues';
import type { Queryable } from '../db';
import {
  calculateEstimated1RM,
  exercisesProgress,
  getDateRange,
  recentPersonalRecords,
  type TimeRange,
} from './strengthProgress';

// ---------------------------------------------------------------------------
// The previous implementation (six queries per Exercise), kept verbatim apart
// from taking `db` instead of getDB(), as the oracle for the set-based query.
// ---------------------------------------------------------------------------

async function legacyPRs(
  db: Queryable,
  exerciseId: number,
): Promise<ExercisePR> {
  const J = `FROM workout_sets ws JOIN workout_logs wl ON ws.workout_log_id = wl.id
             WHERE ws.exercise_id = $1 AND wl.status = 'completed'`;
  const mw = await db.query<{
    value: number;
    reps: number | null;
    date: unknown;
  }>(
    `SELECT ws.weight_kg as value, ws.reps, wl.date ${J} AND ws.weight_kg IS NOT NULL ORDER BY ws.weight_kg DESC LIMIT 1`,
    [exerciseId],
  );
  const mr = await db.query<{ value: number; weight: number; date: unknown }>(
    `SELECT ws.reps as value, ws.weight_kg as weight, wl.date ${J} AND ws.reps IS NOT NULL AND ws.weight_kg > 0 ORDER BY ws.reps DESC LIMIT 1`,
    [exerciseId],
  );
  const mv = await db.query<{ value: number; date: unknown }>(
    `SELECT SUM(ws.weight_kg * ws.reps) as value, wl.date ${J} AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL GROUP BY wl.id, wl.date ORDER BY value DESC LIMIT 1`,
    [exerciseId],
  );
  const m1 = await db.query<{ value: number; date: unknown }>(
    `SELECT ws.weight_kg * (1 + ws.reps::float / 30) as value, wl.date ${J} AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL ORDER BY value DESC LIMIT 1`,
    [exerciseId],
  );
  const [w, r, v, o] = [mw.rows[0], mr.rows[0], mv.rows[0], m1.rows[0]];
  return {
    maxWeight: w
      ? { value: w.value, reps: w.reps, date: pgDate(w.date) }
      : null,
    maxReps: r
      ? { value: r.value, weight: r.weight, date: pgDate(r.date) }
      : null,
    maxVolume: v ? { value: Math.round(v.value), date: pgDate(v.date) } : null,
    max1RM: o ? { value: Math.round(o.value), date: pgDate(o.date) } : null,
  };
}

async function legacyTrend(
  db: Queryable,
  exerciseId: number,
): Promise<ProgressTrend> {
  const result = await db.query<{ max_1rm: number }>(
    `SELECT MAX(ws.weight_kg * (1 + ws.reps::float / 30)) as max_1rm, wl.date
     FROM workout_sets ws JOIN workout_logs wl ON ws.workout_log_id = wl.id
     WHERE ws.exercise_id = $1 AND wl.status = 'completed'
     AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL
     GROUP BY wl.id, wl.date ORDER BY wl.date DESC LIMIT 8`,
    [exerciseId],
  );
  const sessions = result.rows;
  if (sessions.length < 4) return 'plateau';
  const recent = sessions.slice(0, 4);
  const older = sessions.slice(4, 8);
  if (older.length < 2) return 'plateau';
  const recentAvg = recent.reduce((s, x) => s + x.max_1rm, 0) / recent.length;
  const olderAvg = older.reduce((s, x) => s + x.max_1rm, 0) / older.length;
  const change = ((recentAvg - olderAvg) / olderAvg) * 100;
  if (change > 5) return 'progressing';
  if (change < -5) return 'regressing';
  return 'plateau';
}

async function legacyExercisesProgress(
  db: Queryable,
  range: TimeRange,
): Promise<ExerciseProgressSummary[]> {
  const { startDate, endDate } = getDateRange(range);
  const where = startDate ? 'wl.date >= $1 AND wl.date <= $2' : 'wl.date <= $1';
  const result = await db.query<{
    exercise_id: number;
    exercise_name: string;
    muscle_groups: string;
    exercise_type: ExerciseType;
    last_performed: unknown;
    total_sessions: number;
  }>(
    `SELECT DISTINCT e.id as exercise_id, e.name as exercise_name, e.muscle_groups,
       e.exercise_type, MAX(wl.date) as last_performed, COUNT(DISTINCT wl.id) as total_sessions
     FROM exercises e
     JOIN workout_sets ws ON e.id = ws.exercise_id
     JOIN workout_logs wl ON ws.workout_log_id = wl.id
     WHERE ${where} AND wl.status = 'completed'
     GROUP BY e.id, e.name, e.muscle_groups, e.exercise_type
     ORDER BY last_performed DESC`,
    startDate ? [startDate, endDate] : [endDate],
  );
  return Promise.all(
    result.rows.map(async (ex) => {
      const isDurationOnly =
        ex.exercise_type === 'duration' || ex.exercise_type === 'reps_only';
      let estimated1RM: number | null = null;
      let trend: ProgressTrend = 'plateau';
      if (!isDurationOnly) {
        const best = await db.query<{ weight_kg: number; reps: number }>(
          `SELECT ws.weight_kg, ws.reps FROM workout_sets ws
           JOIN workout_logs wl ON ws.workout_log_id = wl.id
           WHERE ws.exercise_id = $1 AND wl.status = 'completed'
           AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL
           ORDER BY (ws.weight_kg * (1 + ws.reps::float / 30)) DESC LIMIT 1`,
          [ex.exercise_id],
        );
        if (best.rows.length > 0) {
          estimated1RM = calculateEstimated1RM(
            best.rows[0].weight_kg,
            best.rows[0].reps,
          );
        }
        trend = await legacyTrend(db, ex.exercise_id);
      }
      return {
        exerciseId: ex.exercise_id,
        exerciseName: ex.exercise_name,
        muscleGroups: ex.muscle_groups,
        exerciseType: ex.exercise_type,
        trend,
        lastPerformed: ex.last_performed ? pgDate(ex.last_performed) : null,
        estimated1RM,
        totalSessions: Number(ex.total_sessions),
        prs: await legacyPRs(db, ex.exercise_id),
      };
    }),
  );
}

// Legacy recent PRs, without the final slice(0, 5) (its row order was
// unspecified, so the oracle compares the full candidate list).
async function legacyRecentPRs(
  db: Queryable,
  since: string,
): Promise<PersonalRecord[]> {
  const result = await db.query<{
    exercise_id: number;
    exercise_name: string;
    max_weight: number;
    max_1rm: number;
    is_weight_pr: boolean;
    is_1rm_pr: boolean;
  }>(
    `WITH recent_maxes AS (
       SELECT e.id as exercise_id, e.name as exercise_name, MAX(ws.weight_kg) as max_weight,
              MAX(ws.reps) as max_reps, MAX(ws.weight_kg * (1 + ws.reps::float / 30)) as max_1rm
       FROM workout_sets ws JOIN workout_logs wl ON ws.workout_log_id = wl.id
       JOIN exercises e ON ws.exercise_id = e.id
       WHERE wl.date >= $1 AND wl.status = 'completed'
       AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL
       GROUP BY e.id, e.name
     ),
     all_time_maxes AS (
       SELECT e.id as exercise_id, MAX(ws.weight_kg) as max_weight,
              MAX(ws.weight_kg * (1 + ws.reps::float / 30)) as max_1rm
       FROM workout_sets ws JOIN workout_logs wl ON ws.workout_log_id = wl.id
       JOIN exercises e ON ws.exercise_id = e.id
       WHERE wl.date < $1 AND wl.status = 'completed'
       AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL
       GROUP BY e.id
     )
     SELECT r.exercise_id, r.exercise_name, r.max_weight, r.max_1rm,
       CASE WHEN r.max_weight > COALESCE(a.max_weight, 0) THEN true ELSE false END as is_weight_pr,
       CASE WHEN r.max_1rm > COALESCE(a.max_1rm, 0) THEN true ELSE false END as is_1rm_pr
     FROM recent_maxes r LEFT JOIN all_time_maxes a ON r.exercise_id = a.exercise_id
     WHERE r.max_weight > COALESCE(a.max_weight, 0) OR r.max_1rm > COALESCE(a.max_1rm, 0)
     LIMIT 10`,
    [since],
  );
  const prs: PersonalRecord[] = [];
  for (const row of result.rows) {
    const base = {
      exerciseId: row.exercise_id,
      exerciseName: row.exercise_name,
      date: since,
    };
    if (row.is_weight_pr)
      prs.push({ ...base, type: 'weight', value: row.max_weight });
    if (row.is_1rm_pr && !row.is_weight_pr)
      prs.push({ ...base, type: '1rm', value: row.max_1rm });
  }
  return prs;
}

// ---------------------------------------------------------------------------
// Seed: deterministic, tie-free on every "best" axis (unique reps per set,
// random REAL weights, one Workout Log per date), with the awkward rows the
// queries filter on: NULL/zero weights, NULL reps, single-rep sets, logs that
// are not completed, and every Exercise Type.
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TYPES: ExerciseType[] = [
  'reps_weight',
  'reps_weight',
  'reps_weight',
  'reps_weight',
  'duration_weight',
  'reps_only',
  'duration',
  'reps_weight',
];

async function seed(pg: PGlite) {
  const rand = mulberry32(7);
  for (const [i, type] of TYPES.entries()) {
    await pg.query(
      `INSERT INTO exercises (id, name, muscle_groups, exercise_type) VALUES ($1, $2, 'chest', $3)`,
      [i + 1, `Ex ${i + 1}`, type],
    );
  }
  const LOGS = 45;
  const SETS_PER = 9; // 3 exercises x 3 sets
  const reps = Array.from({ length: LOGS * SETS_PER }, (_, i) => i + 1);
  for (let i = reps.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [reps[i], reps[j]] = [reps[j], reps[i]];
  }
  let k = 0;
  for (let log = 1; log <= LOGS; log++) {
    const d = new Date();
    d.setDate(d.getDate() - (LOGS - log) * 3);
    const date = formatDate(d);
    const status =
      log % 9 === 0 ? 'incomplete' : log % 13 === 0 ? 'missed' : 'completed';
    await pg.query(
      `INSERT INTO workout_logs (id, date, started_at, ended_at, status) VALUES ($1, $2, $3, $4, $5)`,
      [log, date, `${date}T09:00:00`, `${date}T10:00:00`, status],
    );
    // Exercise 8 is only in the oldest logs: it falls out of the short ranges.
    const pool = log < 10 ? [1, 2, 3, 4, 5, 6, 7, 8] : [1, 2, 3, 4, 5, 6, 7];
    const picked = pool.sort(() => rand() - 0.5).slice(0, 3);
    for (const exerciseId of picked) {
      for (let set = 1; set <= 3; set++) {
        const roll = rand();
        let weight: number | null =
          Math.round((20 + rand() * 100) * 1000) / 1000;
        let r: number | null = reps[k++];
        if (roll < 0.06) weight = null;
        else if (roll < 0.1) weight = 0;
        else if (roll < 0.14) r = null;
        else if (roll < 0.18) r = 1;
        if (TYPES[exerciseId - 1] === 'reps_only') weight = null;
        await pg.query(
          `INSERT INTO workout_sets (workout_log_id, exercise_id, set_number, reps, weight_kg)
           VALUES ($1, $2, $3, $4, $5)`,
          [log, exerciseId, set, r, weight],
        );
      }
    }
  }
}

let pg: PGlite;
let db: Queryable;

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
  await seed(pg);
});

afterEach(async () => {
  await pg.close();
});

const byId = <T extends { exerciseId: number }>(rows: T[]) =>
  [...rows].sort((a, b) => a.exerciseId - b.exerciseId);

describe('exercisesProgress', () => {
  for (const range of ['all', '7d', '30d', '90d'] as TimeRange[]) {
    it(`matches the per-Exercise implementation for range ${range}`, async () => {
      const next = await exercisesProgress(db, range);
      const prev = await legacyExercisesProgress(db, range);
      expect(next.length).toBeGreaterThan(0);
      expect(byId(next)).toEqual(byId(prev));
      // Same order contract: most recently performed first.
      const dates = next.map((e) => e.lastPerformed ?? '');
      expect(dates).toEqual([...dates].sort().reverse());
    });
  }

  it('covers every branch the oracle does (trends, nulls, duration types)', async () => {
    const all = await exercisesProgress(db, 'all');
    expect(new Set(all.map((e) => e.trend)).size).toBeGreaterThan(1);
    expect(
      all.find((e) => e.exerciseType === 'reps_only')?.estimated1RM,
    ).toBeNull();
    expect(
      all.find((e) => e.exerciseType === 'reps_only')?.prs.maxWeight,
    ).toBeNull();
    expect(all.some((e) => e.prs.maxVolume !== null)).toBe(true);
  });

  it('returns nothing for an empty history', async () => {
    await pg.exec('DELETE FROM workout_sets');
    expect(await exercisesProgress(db, 'all')).toEqual([]);
  });
});

describe('recentPersonalRecords', () => {
  it('matches the two-CTE implementation for several windows', async () => {
    for (const daysBack of [0, 3, 6, 7, 9, 12, 20, 30, 45, 60, 90, 200]) {
      const d = new Date();
      d.setDate(d.getDate() - daysBack);
      const since = formatDate(d);
      const next = await recentPersonalRecords(db, since);
      const prev = byId(await legacyRecentPRs(db, since)).slice(0, 5);
      expect(next).toEqual(prev);
    }
  });
});
