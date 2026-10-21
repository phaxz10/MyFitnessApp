import { PGlite } from '@electric-sql/pglite';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BACKUP_VERSION,
  exportBackup,
  importBackup,
  UNSUPPORTED_FILE_ERROR,
} from './backup';
import { runPendingMigrations } from './migrator';

let pg: PGlite;
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
