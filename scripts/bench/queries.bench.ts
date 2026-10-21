/**
 * `pnpm bench`: timings of the hot reads and the backup round trip on a
 * seeded heavy three-year user (seed.ts). Every entry calls the app's own
 * Query / backup code, so a regression shows up here.
 */
import { PGlite } from '@electric-sql/pglite';
import { bench, describe, vi } from 'vitest';
import { createDB, type DB } from '../../src/services/db';
import { runPendingMigrations } from '../../src/services/migrator';
import {
  activeProgram,
  sessionStatusForDate,
  weeklyConsistency,
} from '../../src/services/queries/dashboard';
import { sessions } from '../../src/services/queries/exerciseHistory';
import { exerciseUsage } from '../../src/services/queries/exerciseUsage';
import { listPhotos } from '../../src/services/queries/progressPhotos';
import {
  exercisesProgress,
  overallProgress,
  recentPersonalRecords,
} from '../../src/services/queries/strengthProgress';
import { weightLogForDate } from '../../src/services/queries/weightLogs';
import { recent } from '../../src/services/queries/workoutHistory';
import { seedHeavyUser } from './seed';

// backup.ts reads through getDB(); point it at the bench databases.
const current = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../src/services/db', async (orig) => ({
  ...(await orig<typeof import('../../src/services/db')>()),
  getDB: async () => current.db,
}));
const { exportBackup, importBackup } = await import(
  '../../src/services/backup'
);

const pg = new PGlite();
await runPendingMigrations(pg);
await seedHeavyUser(pg);
const db: DB = createDB(pg);
current.db = db;
const backupZip = await exportBackup();

const restorePg = new PGlite();
await runPendingMigrations(restorePg);
const restoreDb = createDB(restorePg);

const fast = { iterations: 20, warmupIterations: 2, time: 0, warmupTime: 0 };
const slow = { iterations: 3, warmupIterations: 1, time: 0, warmupTime: 0 };
const today = new Date().toISOString().slice(0, 10);
const weekAgo = new Date(Date.now() - 7 * 86400e3).toISOString().slice(0, 10);
const run = (fn: () => Promise<unknown>) => () => fn().then(() => {});

describe('history', () => {
  bench('workoutHistory.recent(5)', run(() => recent(db, 5)), fast);
  bench(
    'exerciseHistory.sessions(last 1, completed sets)',
    run(() =>
      sessions(db, 1, { completedSetsOnly: true, limit: 1, excludeWorkoutLogId: 9999 }),
    ),
    fast,
  );
  bench(
    'exerciseHistory.sessions(last 5, completed workouts)',
    run(() => sessions(db, 1, { completedWorkoutsOnly: true, limit: 5 })),
    fast,
  );
});

describe('progress', () => {
  bench("exercisesProgress('all')", run(() => exercisesProgress(db, 'all')), fast);
  bench('recentPersonalRecords(7d)', run(() => recentPersonalRecords(db, weekAgo)), fast);
  bench("overallProgress('7d')", run(() => overallProgress(db, '7d')), fast);
});

describe('dashboard', () => {
  bench('sessionStatusForDate', run(() => sessionStatusForDate(db, 2, today)), fast);
  bench('activeProgram', run(() => activeProgram(db)), fast);
  bench('weeklyConsistency', run(() => weeklyConsistency(db)), fast);
  bench('exerciseUsage', run(() => exerciseUsage(db, 7)), fast);
});

describe('body', () => {
  bench('progress photos list', run(() => listPhotos(db)), fast);
  bench('weight log for one date', run(() => weightLogForDate(db, today)), fast);
});

describe('backup', () => {
  bench('exportBackup (zip)', run(() => exportBackup()), slow);
  bench(
    'importBackup (full restore)',
    async () => {
      current.db = restoreDb;
      try {
        await importBackup(backupZip);
      } finally {
        current.db = db;
      }
    },
    slow,
  );
});
