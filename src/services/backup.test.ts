import { PGlite } from '@electric-sql/pglite';
import {
  strFromU8,
  strToU8,
  type Unzipped,
  unzip,
  unzipSync,
  zipSync,
} from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BACKUP_VERSION,
  exportBackup,
  INSERT_CHUNK_ROWS,
  importBackup,
  UNSUPPORTED_FILE_ERROR,
} from './backup';
import { runPendingMigrations } from './migrator';

let pg: PGlite;

const unzipAsync = (bytes: Uint8Array) =>
  new Promise<Unzipped>((resolve, reject) =>
    unzip(bytes, (err, out) => (err ? reject(err) : resolve(out))),
  );
vi.mock('./db', () => ({ getDB: async () => pg }));

// A real (tiny) PNG, so the bytes survive a decode/encode round trip.
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPEG_DATA_URL = `data:image/jpeg;base64,${btoa('\xff\xd8\xff\xe0fake-jpeg-bytes\xff\xd9')}`;

const TABLES = [
  'user_profile',
  'weight_logs',
  'exercises',
  'progress_photos',
] as const;

async function seed(db: PGlite) {
  await db.exec(`
    INSERT INTO user_profile (id, birthdate, gender, height_cm, activity_level, goal, diet_type, calorie_target, protein_target_g, carbs_target_g, fat_target_g, ai_provider, ai_model, ai_api_key)
      VALUES (1, '1990-04-02', 'male', 180, 'moderate', 'recomp', 'balanced', 2500, 180, 250, 80, 'openrouter', 'openai/gpt-4o-mini', NULL);
    INSERT INTO weight_logs (date, weight_kg, waist_cm) VALUES ('2026-10-01', 82.5, 85), ('2026-10-08', 82.1, NULL);
    INSERT INTO exercises (name, description, muscle_groups, equipment, exercise_type, is_ai_generated)
      VALUES ('Bench Press', 'Flat bench', '["chest"]', 'barbell', 'reps_weight', false);
  `);
  await db.query(
    `INSERT INTO progress_photos (date, photo_data, photo_type, notes) VALUES
       ('2026-10-01', $1, 'front', 'week 1'),
       ('2026-10-02', $2, 'side', NULL),
       ('2026-10-03', NULL, 'back', 'no image')`,
    [PNG_DATA_URL, JPEG_DATA_URL],
  );
}

async function snapshot(db: PGlite) {
  const out: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    out[table] = (await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
  }
  return out;
}

async function clearAll(db: PGlite) {
  for (const table of [...TABLES].reverse()) {
    await db.exec(`DELETE FROM ${table}`);
  }
}

beforeEach(async () => {
  pg = new PGlite();
  await runPendingMigrations(pg);
});

describe('backup zip format', () => {
  it('round-trips rows and progress photo data URLs through a .zip', async () => {
    await seed(pg);
    const before = await snapshot(pg);

    const zip = await exportBackup();

    // Archive layout: backup.json plus one file per photo with image data.
    const entries = unzipSync(zip);
    expect(Object.keys(entries).sort()).toEqual([
      'backup.json',
      'photos/1.png',
      'photos/2.jpg',
    ]);
    const json = JSON.parse(strFromU8(entries['backup.json']));
    expect(json.version).toBe(BACKUP_VERSION);
    // Timestamps are exported as Postgres text (no UTC 'Z'), so a restore on
    // a non-UTC device cannot shift them by the local offset.
    expect(json.data.weight_logs[0].date).toBe('2026-10-01');
    expect(json.data.weight_logs[0].created_at).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/,
    );
    const photoRows = json.data.progress_photos as Record<string, unknown>[];
    expect(photoRows.map((r) => r.photo_file)).toEqual([
      'photos/1.png',
      'photos/2.jpg',
      null,
    ]);
    expect(
      photoRows.every((r) => !('photo_data' in r) || r.photo_data === null),
    ).toBe(true);

    await clearAll(pg);
    expect((await pg.query('SELECT * FROM progress_photos')).rows).toHaveLength(
      0,
    );

    const result = await importBackup(zip);

    expect(result.hasProfile).toBe(true);
    expect(await snapshot(pg)).toEqual(before);
    const photos = await pg.query<{ photo_data: string | null }>(
      'SELECT photo_data FROM progress_photos ORDER BY id',
    );
    expect(photos.rows.map((r) => r.photo_data)).toEqual([
      PNG_DATA_URL,
      JPEG_DATA_URL,
      null,
    ]);

    // Sequences were reset past the restored ids.
    const next = await pg.query<{ id: number }>(
      `INSERT INTO progress_photos (date, photo_data) VALUES ('2026-10-04', NULL) RETURNING id`,
    );
    expect(next.rows[0].id).toBe(4);
  });

  it('never exports API keys', async () => {
    await seed(pg);
    await pg.exec(`UPDATE user_profile SET ai_api_key = 'sk-or-secret'`);

    const json = strFromU8(unzipSync(await exportBackup())['backup.json']);

    expect(json).not.toContain('sk-or-secret');
    expect(json).not.toContain('ai_api_key');
  });

  it('imports a legacy .json backup with inline photo_data', async () => {
    const legacy = {
      version: '0',
      exported_at: '2026-01-01T00:00:00.000Z',
      data: {
        weight_logs: [
          {
            id: 7,
            date: '2026-01-01',
            weight_kg: 90,
            waist_cm: null,
            neck_cm: null,
            arm_cm: null,
            body_fat_pct: null,
            created_at: '2026-01-01T08:00:00.000Z',
            updated_at: '2026-01-01T08:00:00.000Z',
          },
        ],
        progress_photos: [
          {
            id: 3,
            date: '2026-01-01',
            photo_data: PNG_DATA_URL,
            photo_type: 'front',
            notes: null,
            created_at: '2026-01-01T08:00:00.000Z',
          },
        ],
      },
    };

    const result = await importBackup(strToU8(JSON.stringify(legacy)));

    expect(result.hasProfile).toBe(false);
    const photos = await pg.query<{ id: number; photo_data: string }>(
      'SELECT id, photo_data FROM progress_photos',
    );
    expect(photos.rows).toEqual([{ id: 3, photo_data: PNG_DATA_URL }]);
    const weights = await pg.query<{ id: number; weight_kg: number }>(
      'SELECT id, weight_kg FROM weight_logs',
    );
    expect(weights.rows).toEqual([{ id: 7, weight_kg: 90 }]);
  });

  it('rejects files that are not backups and leaves data untouched', async () => {
    await seed(pg);
    const before = await snapshot(pg);

    await expect(importBackup(strToU8('not a backup'))).rejects.toThrow(
      UNSUPPORTED_FILE_ERROR,
    );
    await expect(
      importBackup(strToU8(JSON.stringify({ hello: 'world' }))),
    ).rejects.toThrow(UNSUPPORTED_FILE_ERROR);
    await expect(
      importBackup(zipSync({ 'readme.txt': strToU8('hi') })),
    ).rejects.toThrow(UNSUPPORTED_FILE_ERROR);
    // A zip whose backup.json points at a photo file that is not there.
    const broken = zipSync({
      'backup.json': strToU8(
        JSON.stringify({
          version: BACKUP_VERSION,
          exported_at: '2026-01-01T00:00:00.000Z',
          data: {
            progress_photos: [
              { id: 1, date: '2026-01-01', photo_file: 'photos/1.png' },
            ],
          },
        }),
      ),
    });
    await expect(importBackup(broken)).rejects.toThrow(/damaged/);

    expect(await snapshot(pg)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// Weight unit (migration v6). Before v6 the set-row UI labelled weight_kg as
// "lbs", so lifting weights in pre-v6 backups are pounds.
// ---------------------------------------------------------------------------

const PROFILE_ROW = {
  id: 1,
  birthdate: '1990-04-02',
  gender: 'male',
  height_cm: 180,
  activity_level: 'moderate',
  goal: 'recomp',
  diet_type: 'balanced',
  calorie_target: 2500,
  protein_target_g: 180,
  carbs_target_g: 250,
  fat_target_g: 80,
  ai_provider: 'openrouter',
  ai_model: 'openai/gpt-4o-mini',
  created_at: '2026-01-01 08:00:00',
  updated_at: '2026-01-01 08:00:00',
};

const WORKOUT_DATA = {
  exercises: [{ id: 1, name: 'Bench Press', exercise_type: 'reps_weight' }],
  workout_logs: [
    {
      id: 1,
      date: '2026-01-01',
      started_at: '2026-01-01 09:00:00',
      ended_at: '2026-01-01 10:00:00',
      status: 'completed',
    },
  ],
  workout_sets: [
    {
      id: 1,
      workout_log_id: 1,
      exercise_id: 1,
      set_number: 1,
      reps: 8,
      weight_kg: 135,
    },
    {
      id: 2,
      workout_log_id: 1,
      exercise_id: 1,
      set_number: 2,
      reps: 8,
      weight_kg: null,
    },
  ],
};

function backupJson(version: string, data: Record<string, unknown[]>) {
  return strToU8(
    JSON.stringify({ version, exported_at: '2026-01-01T00:00:00.000Z', data }),
  );
}

async function readUnitAndSets(db: PGlite) {
  const profile = await db.query<{ weight_unit: string }>(
    'SELECT weight_unit FROM user_profile WHERE id = 1',
  );
  const sets = await db.query<{ weight_kg: number | null }>(
    'SELECT weight_kg FROM workout_sets ORDER BY id',
  );
  return {
    unit: profile.rows[0]?.weight_unit,
    weights: sets.rows.map((r) => r.weight_kg),
  };
}

describe('backup weight unit', () => {
  it('round-trips weight_unit and kg-stored lifts unchanged', async () => {
    await seed(pg);
    await pg.exec(`
      UPDATE user_profile SET weight_unit = 'lbs';
      INSERT INTO workout_logs (date, started_at) VALUES ('2026-10-01', '2026-10-01 09:00:00');
      INSERT INTO workout_sets (workout_log_id, exercise_id, set_number, reps, weight_kg) VALUES (1, 1, 1, 8, 61.25);
    `);
    const before = await readUnitAndSets(pg);

    const zip = await exportBackup();
    const json = JSON.parse(strFromU8(unzipSync(zip)['backup.json']));
    expect(json.data.user_profile[0].weight_unit).toBe('lbs');

    await pg.exec('DELETE FROM workout_sets; DELETE FROM workout_logs');
    await clearAll(pg);
    await importBackup(zip);

    expect(await readUnitAndSets(pg)).toEqual(before);
    expect(before).toEqual({ unit: 'lbs', weights: [61.25] });
  });

  it('treats a pre-units backup like migration v6: profile lbs, lifts converted to kg', async () => {
    await importBackup(
      backupJson('2.0', { user_profile: [PROFILE_ROW], ...WORKOUT_DATA }),
    );

    const { unit, weights } = await readUnitAndSets(pg);
    expect(unit).toBe('lbs');
    expect(weights[0]).toBeCloseTo(135 * 0.45359237, 4);
    expect(weights[1]).toBeNull();
  });

  it('converts lifts from a pre-units backup that has no profile', async () => {
    await importBackup(backupJson('0', WORKOUT_DATA));
    const { weights } = await readUnitAndSets(pg);
    expect(weights[0]).toBeCloseTo(135 * 0.45359237, 4);
  });

  it('defaults a current-format profile without weight_unit to kg and converts nothing', async () => {
    await importBackup(
      backupJson(BACKUP_VERSION, {
        user_profile: [PROFILE_ROW],
        ...WORKOUT_DATA,
      }),
    );
    expect(await readUnitAndSets(pg)).toEqual({
      unit: 'kg',
      weights: [135, null],
    });
  });
});

// ---------------------------------------------------------------------------
// Batched restore (json_populate_recordset) and derived thumbnails.
// ---------------------------------------------------------------------------

async function seedHistory(db: PGlite, sets: number, foods: number) {
  await db.exec(`
    INSERT INTO exercises (name, description, muscle_groups, equipment, exercise_type, is_ai_generated)
      VALUES ('Squat', NULL, '["legs"]', 'barbell', 'reps_weight', false);
    INSERT INTO workout_logs (date, started_at, ended_at, status, notes)
      VALUES ('2026-10-01', '2026-10-01 09:00:00.123456', NULL, 'in_progress', NULL);
  `);
  await db.exec(`
    INSERT INTO workout_sets (workout_log_id, exercise_id, set_number, reps, weight_kg, duration_seconds, notes, completed_at, created_at)
    SELECT 1, 1, g,
      CASE WHEN g % 5 = 0 THEN NULL ELSE g % 12 END,
      CASE WHEN g % 7 = 0 THEN NULL ELSE (g * 1.37)::real END,
      CASE WHEN g % 3 = 0 THEN g ELSE NULL END,
      CASE WHEN g % 4 = 0 THEN 'note ' || g || E' "quoted" \\\\ \n' ELSE NULL END,
      CASE WHEN g % 2 = 0 THEN TIMESTAMP '2026-10-01 09:00:00.5' + g * INTERVAL '1 second' ELSE NULL END,
      TIMESTAMP '2026-10-01 08:00:00.000001' + g * INTERVAL '1 minute'
    FROM generate_series(1, ${sets}) AS g;
    INSERT INTO food_entries (date, meal_type, food_description, portion_grams, calories, protein_g, carbs_g, fat_g, is_ai_generated, created_at, updated_at)
    SELECT DATE '2026-01-01' + (g % 300), 'snack', 'food ' || g, (g * 0.1)::real, g, (g / 3.0)::real, 0.1, 33.333, g % 2 = 0,
      TIMESTAMP '2026-01-01 12:34:56.789' + g * INTERVAL '1 hour',
      CASE WHEN g % 9 = 0 THEN NULL ELSE TIMESTAMP '2026-01-02 00:00:00' END
    FROM generate_series(1, ${foods}) AS g;
  `);
}

const HISTORY_TABLES = [
  'exercises',
  'workout_logs',
  'workout_sets',
  'food_entries',
] as const;

async function historySnapshot(db: PGlite) {
  const out: Record<string, unknown[]> = {};
  for (const table of HISTORY_TABLES) {
    out[table] = (await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
  }
  return out;
}

describe('batched restore', () => {
  it('round-trips a few hundred sets and food entries exactly into a fresh DB', async () => {
    await seedHistory(pg, 300, 400);
    const before = await historySnapshot(pg);
    expect(before.workout_sets).toHaveLength(300);
    expect(before.food_entries).toHaveLength(400);

    const zip = await exportBackup();
    pg = new PGlite();
    await runPendingMigrations(pg);
    await importBackup(zip);

    expect(await historySnapshot(pg)).toEqual(before);
  });

  it('restores more rows than one insert chunk holds', async () => {
    expect(INSERT_CHUNK_ROWS).toBeLessThan(2500);
    await seedHistory(pg, 2500, 10);
    const before = await historySnapshot(pg);

    const zip = await exportBackup();
    pg = new PGlite();
    await runPendingMigrations(pg);
    const query = vi.spyOn(pg, 'query');
    await importBackup(zip);

    const setInserts = query.mock.calls.filter(([sql]) =>
      String(sql).startsWith('INSERT INTO workout_sets'),
    );
    expect(setInserts).toHaveLength(Math.ceil(2500 / INSERT_CHUNK_ROWS));
    expect(await historySnapshot(pg)).toEqual(before);
    const next = await pg.query<{ id: number }>(
      `INSERT INTO workout_sets (workout_log_id, exercise_id, set_number) VALUES (1, 1, 1) RETURNING id`,
    );
    expect(next.rows[0].id).toBe(2501);
  });

  it('keeps program_exercise_id only when that Program Exercise is restored', async () => {
    await importBackup(
      backupJson(BACKUP_VERSION, {
        exercises: [{ id: 1, name: 'Bench Press' }],
        workout_logs: [
          {
            id: 1,
            date: '2026-01-01',
            started_at: '2026-01-01 09:00:00',
            ended_at: null,
          },
        ],
        workout_log_exercises: [
          {
            id: 1,
            workout_log_id: 1,
            exercise_id: 1,
            order_index: 0,
            program_exercise_id: 99,
          },
        ],
      }),
    );
    const rows = await pg.query<{ program_exercise_id: number | null }>(
      'SELECT program_exercise_id FROM workout_log_exercises',
    );
    expect(rows.rows).toEqual([{ program_exercise_id: null }]);
    const logs = await pg.query<{ status: string }>(
      'SELECT status FROM workout_logs',
    );
    expect(logs.rows).toEqual([{ status: 'in_progress' }]);
  });
});

describe('progress photo thumbnails', () => {
  it('never exports thumb_data', async () => {
    await seed(pg);
    await pg.exec(
      `UPDATE progress_photos SET thumb_data = 'data:image/jpeg;base64,THUMB'`,
    );

    const json = strFromU8(
      (await unzipAsync(await exportBackup()))['backup.json'],
    );

    expect(json).not.toContain('thumb_data');
    expect(json).not.toContain('THUMB');
  });

  it('never imports thumb_data (left NULL for the app to backfill)', async () => {
    await importBackup(
      backupJson(BACKUP_VERSION, {
        progress_photos: [
          {
            id: 1,
            date: '2026-01-01',
            photo_data: PNG_DATA_URL,
            thumb_data: 'data:image/jpeg;base64,THUMB',
            photo_type: 'front',
          },
        ],
      }),
    );
    const rows = await pg.query<{
      photo_data: string;
      thumb_data: string | null;
    }>('SELECT photo_data, thumb_data FROM progress_photos');
    expect(rows.rows).toEqual([{ photo_data: PNG_DATA_URL, thumb_data: null }]);
  });
});
