import { strFromU8, strToU8, unzipSync, type Zippable, zipSync } from 'fflate';
import { toOpenRouterModelId } from '../constants/aiProviders';
import { getLocalDateString } from '../utils/date';
import { isWeightUnit, KG_PER_LB } from '../utils/units';
import { getDB } from './db';

// ---------------------------------------------------------------------------
// Backup format (ADR-0008)
//
// A backup is a `.zip` holding:
//   backup.json          BackupData; progress_photos rows carry `photo_file`
//                        instead of the inline `photo_data` data URL
//   photos/<id>.<ext>    the decoded image bytes for each photo
//
// Legacy `.json` backups (version '0', photo_data inline) still import.
// ---------------------------------------------------------------------------

// 2.1: user_profile.weight_unit; lifting weights are kg (migration v6).
export const BACKUP_VERSION = '2.1';

/**
 * Backups older than 2.1 predate the weight-unit setting: their lifting
 * weights (workout_sets.weight_kg) were entered under a "lbs" label. Import
 * treats them exactly like migration v6 treats existing rows: profile unit
 * 'lbs', lifting weights converted lbs -> kg. Body weight is kg in every
 * version.
 */
export function isPreUnitsBackup(version: string): boolean {
  const [major = 0, minor = 0] = version.split('.').map(Number);
  if (Number.isNaN(major) || Number.isNaN(minor)) return true;
  return major < 2 || (major === 2 && minor < 1);
}
const BACKUP_JSON = 'backup.json';
const PHOTOS_DIR = 'photos/';

interface BackupData {
  version: string;
  exported_at: string;
  data: {
    user_profile: unknown[];
    weight_logs: unknown[];
    food_entries: unknown[];
    exercises: unknown[];
    workout_programs: unknown[];
    program_sessions: unknown[];
    program_exercises: unknown[];
    workout_logs: unknown[];
    workout_log_exercises: unknown[];
    workout_sets: unknown[];
    exercise_notes: unknown[];
    ai_goal_reviews: unknown[];
    weekly_reviews: unknown[];
    progress_photos: unknown[];
  };
}

/**
 * Export options - user-friendly category groupings
 */
export interface ExportOptions {
  userProfile: boolean;
  weightLogs: boolean;
  calorieLogs: boolean;
  exercises: boolean;
  workoutPrograms: boolean; // Includes program_sessions and program_exercises
  workoutHistory: boolean; // Includes workout_logs and workout_sets
  aiReviews: boolean; // Includes ai_goal_reviews and weekly_reviews
  progressPhotos: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  userProfile: true,
  weightLogs: true,
  calorieLogs: true,
  exercises: true,
  workoutPrograms: true,
  workoutHistory: true,
  aiReviews: true,
  progressPhotos: true,
};

export const EXPORT_OPTION_LABELS: Record<keyof ExportOptions, string> = {
  userProfile: 'User Profile',
  weightLogs: 'Weight Logs',
  calorieLogs: 'Calorie Logs',
  exercises: 'Exercises',
  workoutPrograms: 'Workout Programs',
  workoutHistory: 'Workout History',
  aiReviews: 'AI Reviews (Goal & Weekly)',
  progressPhotos: 'Progress Photos',
};

export const UNSUPPORTED_FILE_ERROR =
  'This file is not a MyPersonalFitness backup. Choose a backup .zip or .json file.';
const DAMAGED_FILE_ERROR =
  'This backup file is damaged or incomplete and could not be restored.';

// API keys never leave the device, whatever the export path.
const SENSITIVE_FIELD_REGEX = /api_key/i;

const sanitizeRows = (rows: unknown[]): unknown[] =>
  rows.map((row) =>
    row && typeof row === 'object'
      ? Object.fromEntries(
          Object.entries(row).filter(
            ([key]) => !SENSITIVE_FIELD_REGEX.test(key),
          ),
        )
      : row,
  );

// ---------------------------------------------------------------------------
// Photo <-> file conversion
// ---------------------------------------------------------------------------

const DATA_URL_RE = /^data:image\/([a-z0-9.+-]+);base64,(.*)$/is;

// MIME subtype <-> file extension where they differ.
const EXT_FOR_SUBTYPE: Record<string, string> = {
  jpeg: 'jpg',
  'svg+xml': 'svg',
};
const SUBTYPE_FOR_EXT: Record<string, string> = { jpg: 'jpeg', svg: 'svg+xml' };

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Split a base64 image data URL into a zip-relative path and its bytes. */
function photoToFile(
  id: unknown,
  dataUrl: string,
): { path: string; bytes: Uint8Array } | null {
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) return null;
  const subtype = match[1].toLowerCase();
  const ext = EXT_FOR_SUBTYPE[subtype] ?? subtype;
  try {
    return {
      path: `${PHOTOS_DIR}${String(id)}.${ext}`,
      bytes: base64ToBytes(match[2]),
    };
  } catch {
    return null;
  }
}

function fileToDataUrl(path: string, bytes: Uint8Array): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const subtype = SUBTYPE_FOR_EXT[ext] ?? ext;
  return `data:image/${subtype};base64,${bytesToBase64(bytes)}`;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

// Read date/time columns as Postgres text, not JS Dates. PGlite parses
// TIMESTAMP (no time zone) as *local* time; serialising that Date to UTC ISO
// and inserting it back into a TIMESTAMP column drops the offset, so every
// restore shifted created_at/updated_at by the device's UTC offset.
const keepText = (value: string) => value;
const RAW_DATETIME_PARSERS = {
  1082: keepText, // date
  1083: keepText, // time
  1114: keepText, // timestamp
  1184: keepText, // timestamptz
};

async function collectBackupData(options: ExportOptions): Promise<BackupData> {
  const raw = await getDB();
  const db = {
    query: (sql: string) =>
      raw.query(sql, [], { parsers: RAW_DATETIME_PARSERS }),
  };
  const none = Promise.resolve({ rows: [] as unknown[] });

  // Only query tables that are selected for export
  const [
    userProfile,
    weightLogs,
    foodEntries,
    exercises,
    workoutPrograms,
    programSessions,
    programExercises,
    workoutLogs,
    workoutLogExercises,
    workoutSets,
    exerciseNotes,
    aiGoalReviews,
    weeklyReviews,
    progressPhotos,
  ] = await Promise.all([
    options.userProfile ? db.query('SELECT * FROM user_profile') : none,
    options.weightLogs
      ? db.query('SELECT * FROM weight_logs ORDER BY date')
      : none,
    options.calorieLogs
      ? db.query('SELECT * FROM food_entries ORDER BY date, id')
      : none,
    options.exercises ? db.query('SELECT * FROM exercises ORDER BY id') : none,
    options.workoutPrograms
      ? db.query('SELECT * FROM workout_programs ORDER BY id')
      : none,
    options.workoutPrograms
      ? db.query(
          'SELECT * FROM program_sessions ORDER BY program_id, order_index',
        )
      : none,
    options.workoutPrograms
      ? db.query(
          'SELECT * FROM program_exercises ORDER BY session_id, order_index',
        )
      : none,
    options.workoutHistory
      ? db.query('SELECT * FROM workout_logs ORDER BY date')
      : none,
    options.workoutHistory
      ? db.query(
          'SELECT * FROM workout_log_exercises ORDER BY workout_log_id, order_index',
        )
      : none,
    options.workoutHistory
      ? db.query(
          'SELECT * FROM workout_sets ORDER BY workout_log_id, set_number',
        )
      : none,
    options.exercises
      ? db.query(
          'SELECT * FROM exercise_notes ORDER BY exercise_id, created_at',
        )
      : none,
    options.aiReviews
      ? db.query('SELECT * FROM ai_goal_reviews ORDER BY review_date')
      : none,
    options.aiReviews
      ? db.query('SELECT * FROM weekly_reviews ORDER BY week_start')
      : none,
    options.progressPhotos
      ? db.query('SELECT * FROM progress_photos ORDER BY date, created_at')
      : none,
  ]);

  return {
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    data: {
      user_profile: sanitizeRows(userProfile.rows),
      weight_logs: sanitizeRows(weightLogs.rows),
      food_entries: sanitizeRows(foodEntries.rows),
      exercises: sanitizeRows(exercises.rows),
      workout_programs: sanitizeRows(workoutPrograms.rows),
      program_sessions: sanitizeRows(programSessions.rows),
      program_exercises: sanitizeRows(programExercises.rows),
      workout_logs: sanitizeRows(workoutLogs.rows),
      workout_log_exercises: sanitizeRows(workoutLogExercises.rows),
      workout_sets: sanitizeRows(workoutSets.rows),
      exercise_notes: sanitizeRows(exerciseNotes.rows),
      ai_goal_reviews: sanitizeRows(aiGoalReviews.rows),
      weekly_reviews: sanitizeRows(weeklyReviews.rows),
      progress_photos: sanitizeRows(progressPhotos.rows),
    },
  };
}

/** Build a backup `.zip` (backup.json + photos/) for the selected categories. */
export async function exportBackup(
  options: ExportOptions = DEFAULT_EXPORT_OPTIONS,
): Promise<Uint8Array> {
  const backup = await collectBackupData(options);
  const files: Zippable = {};

  backup.data.progress_photos = backup.data.progress_photos.map((raw) => {
    const { photo_data, ...row } = raw as Record<string, unknown>;
    const file =
      typeof photo_data === 'string' ? photoToFile(row.id, photo_data) : null;
    if (file) {
      // Images are already compressed; store them as-is.
      files[file.path] = [file.bytes, { level: 0 }];
      return { ...row, photo_file: file.path };
    }
    // Not a base64 image data URL (or no image at all): keep it inline so
    // nothing is lost.
    return { ...row, photo_file: null, photo_data: photo_data ?? null };
  });

  files[BACKUP_JSON] = strToU8(JSON.stringify(backup, null, 2));
  return zipSync(files);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

function isZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

function assertBackupShape(value: unknown): asserts value is BackupData {
  const v = value as Partial<BackupData> | null;
  if (
    !v ||
    typeof v !== 'object' ||
    typeof v.version !== 'string' ||
    !v.data ||
    typeof v.data !== 'object'
  ) {
    throw new Error(UNSUPPORTED_FILE_ERROR);
  }
}

function parseZipBackup(bytes: Uint8Array): BackupData {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error(DAMAGED_FILE_ERROR);
  }
  const json = entries[BACKUP_JSON];
  if (!json) throw new Error(UNSUPPORTED_FILE_ERROR);

  let backup: unknown;
  try {
    backup = JSON.parse(strFromU8(json));
  } catch {
    throw new Error(DAMAGED_FILE_ERROR);
  }
  assertBackupShape(backup);

  if (Array.isArray(backup.data.progress_photos)) {
    backup.data.progress_photos = backup.data.progress_photos.map((raw) => {
      const { photo_file, ...row } = raw as Record<string, unknown>;
      if (typeof photo_file !== 'string') {
        return { ...row, photo_data: row.photo_data ?? null };
      }
      const file = entries[photo_file];
      if (!photo_file.startsWith(PHOTOS_DIR) || !file) {
        throw new Error(DAMAGED_FILE_ERROR);
      }
      return { ...row, photo_data: fileToDataUrl(photo_file, file) };
    });
  }
  return backup;
}

function parseJsonBackup(bytes: Uint8Array): BackupData {
  let backup: unknown;
  try {
    backup = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error(UNSUPPORTED_FILE_ERROR);
  }
  assertBackupShape(backup);
  return backup;
}

/** Parse a backup file's bytes: the `.zip` format, or a legacy `.json`. */
export function parseBackup(bytes: Uint8Array): BackupData {
  return isZip(bytes) ? parseZipBackup(bytes) : parseJsonBackup(bytes);
}

export interface ImportResult {
  /** Whether the backup restored a user profile (onboarding can be skipped). */
  hasProfile: boolean;
}

/**
 * Restore a backup file (`.zip` or legacy `.json`). Tables present in the
 * backup are replaced; the whole restore runs in one transaction.
 */
export async function importBackup(bytes: Uint8Array): Promise<ImportResult> {
  const backup = parseBackup(bytes);
  const db = await getDB();

  // Wrap the entire import in a transaction. Without this, a single failing
  // INSERT mid-restore (most often a FK violation when a program_exercises row
  // references an exercise that didn't make it into the backup) would leave
  // the DB in a half-restored state — programs and sessions present but their
  // exercises missing. With the wrap, any failure rolls back cleanly and the
  // caller sees a real error instead of silent data loss.
  await db.exec('BEGIN');
  try {
    await importDataInner(db, backup);
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }

  const profiles = backup.data.user_profile;
  return { hasProfile: Array.isArray(profiles) && profiles.length > 0 };
}

// biome-ignore lint/suspicious/noExplicitAny: PGlite db type is wide; this stays internal.
async function importDataInner(db: any, backup: BackupData): Promise<void> {
  const { data } = backup;
  const preUnits = isPreUnitsBackup(backup.version);
  const liftKg = (value: unknown): unknown =>
    preUnits && typeof value === 'number' ? value * KG_PER_LB : value;

  // Helper to check if a table has data to import
  const hasData = (arr: unknown[] | undefined): arr is unknown[] =>
    Array.isArray(arr) && arr.length > 0;

  // Determine which tables to clear and import based on what's in the backup
  // We only clear tables that have data in the backup (partial restore)
  const tablesToClear: string[] = [];

  // Build list of tables to clear in reverse dependency order
  if (hasData(data.weekly_reviews)) tablesToClear.push('weekly_reviews');
  if (hasData(data.ai_goal_reviews)) tablesToClear.push('ai_goal_reviews');
  if (hasData(data.exercise_notes)) tablesToClear.push('exercise_notes');
  if (hasData(data.workout_sets)) tablesToClear.push('workout_sets');
  if (hasData(data.workout_log_exercises))
    tablesToClear.push('workout_log_exercises');
  if (hasData(data.workout_logs)) tablesToClear.push('workout_logs');
  if (hasData(data.program_exercises)) tablesToClear.push('program_exercises');
  if (hasData(data.program_sessions)) tablesToClear.push('program_sessions');
  if (hasData(data.workout_programs)) tablesToClear.push('workout_programs');
  if (hasData(data.exercises)) tablesToClear.push('exercises');
  if (hasData(data.food_entries)) tablesToClear.push('food_entries');
  if (hasData(data.progress_photos)) tablesToClear.push('progress_photos');
  if (hasData(data.weight_logs)) tablesToClear.push('weight_logs');
  if (hasData(data.user_profile)) tablesToClear.push('user_profile');

  // Clear existing data for tables that have data in the backup
  for (const table of tablesToClear) {
    await db.exec(`DELETE FROM ${table}`);
  }

  // Import data in order of dependencies
  // User profile.
  //
  // Backwards compatibility: backups created before migration v3 carry
  // `openai_api_key` / `openai_proxy_url` and no `ai_provider` / `ai_model`.
  // Map them onto the new columns so old backups restore cleanly.
  if (hasData(data.user_profile)) {
    for (const row of data.user_profile as Record<string, unknown>[]) {
      const aiApiKey = (row.ai_api_key ?? row.openai_api_key ?? null) as
        | string
        | null;
      const aiProxyUrl = (row.ai_proxy_url ?? row.openai_proxy_url ?? null) as
        | string
        | null;
      // ADR-0007: OpenRouter is the single provider. Backups made before this
      // migration carry legacy vendored providers and raw vendor keys — neither
      // is usable against OpenRouter (which needs an sk-or- key), so provider
      // is forced to 'openrouter' and vendor keys are dropped rather than
      // written as values a later AI call would 401 on. The CHECK constraint
      // re-added by migration v5 also requires this: inserting legacy provider
      // strings would violate it and fail the restore.
      const hasLegacyVendorKey =
        (row.ai_provider as string | undefined) !== 'openrouter';
      const aiProvider = 'openrouter';
      const aiModel = toOpenRouterModelId(
        (row.ai_model as string | undefined) ?? 'gpt-4o',
      );
      // Backups predating the carb-strategy feature have no diet_type;
      // default to 'balanced' so they restore with unchanged macros.
      const dietType = (row.diet_type ?? 'balanced') as string;
      // Pre-units backups were used under "lbs" lift labels (see
      // isPreUnitsBackup); current backups always carry weight_unit.
      const weightUnit = preUnits
        ? 'lbs'
        : isWeightUnit(row.weight_unit)
          ? row.weight_unit
          : 'kg';

      await db.query(
        `INSERT INTO user_profile (id, birthdate, gender, height_cm, activity_level, goal, diet_type, calorie_target, protein_target_g, carbs_target_g, fat_target_g, ai_provider, ai_model, ai_api_key, ai_proxy_url, created_at, updated_at, weight_unit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          row.id,
          row.birthdate ?? getLocalDateString(),
          row.gender,
          row.height_cm,
          row.activity_level,
          row.goal,
          dietType,
          row.calorie_target,
          row.protein_target_g,
          row.carbs_target_g,
          row.fat_target_g,
          aiProvider,
          aiModel,
          // Legacy vendor keys cannot authenticate against OpenRouter; for
          // OpenRouter backups the stored key is already an sk-or- key.
          hasLegacyVendorKey ? null : aiApiKey,
          // The legacy OpenAI proxy is obsolete — OpenRouter is browser-direct.
          hasLegacyVendorKey ? null : aiProxyUrl,
          row.created_at,
          row.updated_at,
          weightUnit,
        ],
      );
    }
  }

  // Weight logs
  if (hasData(data.weight_logs)) {
    for (const row of data.weight_logs as Record<string, unknown>[]) {
      await db.query(
        `INSERT INTO weight_logs (id, date, weight_kg, waist_cm, neck_cm, arm_cm, body_fat_pct, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          row.id,
          row.date,
          row.weight_kg,
          row.waist_cm,
          row.neck_cm,
          row.arm_cm,
          row.body_fat_pct,
          row.created_at,
          row.updated_at,
        ],
      );
    }
  }

  // Food entries
  if (hasData(data.food_entries)) {
    for (const row of data.food_entries as Record<string, unknown>[]) {
      await db.query(
        `INSERT INTO food_entries (id, date, meal_type, food_description, portion_grams, calories, protein_g, carbs_g, fat_g, is_ai_generated, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          row.id,
          row.date,
          row.meal_type,
          row.food_description,
          row.portion_grams,
          row.calories,
          row.protein_g,
          row.carbs_g,
          row.fat_g,
          row.is_ai_generated,
          row.created_at,
          row.updated_at,
        ],
      );
    }
  }

  // Exercises (updated with video_url and exercise_type)
  if (hasData(data.exercises)) {
    for (const row of data.exercises as Record<string, unknown>[]) {
      await db.query(
        `INSERT INTO exercises (id, name, description, muscle_groups, equipment, video_url, exercise_type, is_ai_generated, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          row.id,
          row.name,
          row.description,
          row.muscle_groups,
          row.equipment,
          row.video_url ?? null,
          row.exercise_type ?? 'reps_weight',
          row.is_ai_generated,
          row.created_at,
        ],
      );
    }
  }

  // Workout programs
  if (hasData(data.workout_programs)) {
    for (const row of data.workout_programs as Record<string, unknown>[]) {
      await db.query(
        `INSERT INTO workout_programs (id, name, description, sessions_per_week, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          row.id,
          row.name,
          row.description,
          row.sessions_per_week,
          row.is_active,
          row.created_at,
          row.updated_at,
        ],
      );
    }
  }

  // Program sessions
  if (hasData(data.program_sessions)) {
    for (const row of data.program_sessions as Record<string, unknown>[]) {
      await db.query(
        `INSERT INTO program_sessions (id, program_id, name, day_of_week, order_index, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          row.id,
          row.program_id,
          row.name,
          row.day_of_week,
          row.order_index,
          row.created_at,
        ],
      );
    }
  }

  // Program exercises (updated with target_duration_seconds and superset_group_id)
  if (hasData(data.program_exercises)) {
    for (const row of data.program_exercises as Record<string, unknown>[]) {
      await db.query(
        `INSERT INTO program_exercises (id, session_id, exercise_id, target_sets, target_rep_min, target_rep_max, target_duration_seconds, order_index, superset_group_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          row.id,
          row.session_id,
          row.exercise_id,
          row.target_sets,
          row.target_rep_min,
          row.target_rep_max,
          row.target_duration_seconds ?? null,
          row.order_index,
          row.superset_group_id ?? null,
          row.notes,
        ],
      );
    }
  }

  // Workout logs (updated with status field)
  if (hasData(data.workout_logs)) {
    for (const row of data.workout_logs as Record<string, unknown>[]) {
      // Determine status: if status exists use it, otherwise infer from ended_at
      const status = row.status ?? (row.ended_at ? 'completed' : 'in_progress');

      await db.query(
        `INSERT INTO workout_logs (id, program_id, session_id, date, started_at, ended_at, status, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          row.id,
          row.program_id,
          row.session_id,
          row.date,
          row.started_at,
          row.ended_at,
          status,
          row.notes,
          row.created_at,
        ],
      );
    }
  }

  // Workout log exercises (independent copy of exercises for a specific workout)
  if (hasData(data.workout_log_exercises)) {
    for (const row of data.workout_log_exercises as Record<string, unknown>[]) {
      await db.query(
        `INSERT INTO workout_log_exercises (id, workout_log_id, exercise_id, order_index, superset_group_id, target_sets, target_rep_min, target_rep_max, target_duration_seconds, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          row.id,
          row.workout_log_id,
          row.exercise_id,
          row.order_index,
          row.superset_group_id ?? null,
          row.target_sets ?? null,
          row.target_rep_min ?? null,
          row.target_rep_max ?? null,
          row.target_duration_seconds ?? null,
          row.notes ?? null,
          row.created_at,
        ],
      );
    }
  }

  // Workout sets (updated with duration_seconds, workout_log_exercise_id, and completed_at)
  if (hasData(data.workout_sets)) {
    for (const row of data.workout_sets as Record<string, unknown>[]) {
      await db.query(
        `INSERT INTO workout_sets (id, workout_log_id, exercise_id, workout_log_exercise_id, set_number, reps, weight_kg, duration_seconds, notes, completed_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          row.id,
          row.workout_log_id,
          row.exercise_id,
          row.workout_log_exercise_id ?? null,
          row.set_number,
          row.reps ?? null,
          liftKg(row.weight_kg ?? null),
          row.duration_seconds ?? null,
          row.notes ?? null,
          row.completed_at ?? null,
          row.created_at,
        ],
      );
    }
  }

  // Exercise notes (per-exercise notes tied to master exercise)
  if (hasData(data.exercise_notes)) {
    for (const row of data.exercise_notes as Record<string, unknown>[]) {
      await db.query(
        `INSERT INTO exercise_notes (id, exercise_id, content, created_at)
         VALUES ($1, $2, $3, $4)`,
        [row.id, row.exercise_id, row.content, row.created_at],
      );
    }
  }

  // AI goal reviews
  if (hasData(data.ai_goal_reviews)) {
    for (const row of data.ai_goal_reviews as Record<string, unknown>[]) {
      await db.query(
        `INSERT INTO ai_goal_reviews (id, review_date, previous_calorie_target, new_calorie_target, previous_goal, new_goal_suggestion, ai_analysis, was_accepted, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          row.id,
          row.review_date,
          row.previous_calorie_target,
          row.new_calorie_target,
          row.previous_goal,
          row.new_goal_suggestion,
          row.ai_analysis,
          row.was_accepted,
          row.created_at,
        ],
      );
    }
  }

  // Weekly reviews (NEW)
  if (hasData(data.weekly_reviews)) {
    for (const row of data.weekly_reviews as Record<string, unknown>[]) {
      await db.query(
        `INSERT INTO weekly_reviews (id, week_start, week_end, start_weight, end_weight, weight_change, avg_daily_calories, calorie_target, calorie_adherence, workouts_completed, previous_goal, new_goal, previous_calorie_target, new_calorie_target, ai_summary, recommendations_applied, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          row.id,
          row.week_start,
          row.week_end,
          row.start_weight,
          row.end_weight,
          row.weight_change,
          row.avg_daily_calories,
          row.calorie_target,
          row.calorie_adherence,
          row.workouts_completed,
          row.previous_goal,
          row.new_goal,
          row.previous_calorie_target,
          row.new_calorie_target,
          row.ai_summary,
          row.recommendations_applied,
          row.created_at,
        ],
      );
    }
  }

  // Progress photos (photo_data may be null: a backup row can carry no image)
  if (hasData(data.progress_photos)) {
    for (const row of data.progress_photos as Record<string, unknown>[]) {
      await db.query(
        `INSERT INTO progress_photos (id, date, photo_data, photo_type, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          row.id,
          row.date,
          row.photo_data ?? null,
          row.photo_type,
          row.notes,
          row.created_at,
        ],
      );
    }
  }

  // Reset sequences only for tables that were imported
  const sequenceResets: string[] = [];
  if (hasData(data.weight_logs)) {
    sequenceResets.push(
      "SELECT setval('weight_logs_id_seq', COALESCE((SELECT MAX(id) FROM weight_logs), 0) + 1, false)",
    );
  }
  if (hasData(data.food_entries)) {
    sequenceResets.push(
      "SELECT setval('food_entries_id_seq', COALESCE((SELECT MAX(id) FROM food_entries), 0) + 1, false)",
    );
  }
  if (hasData(data.exercises)) {
    sequenceResets.push(
      "SELECT setval('exercises_id_seq', COALESCE((SELECT MAX(id) FROM exercises), 0) + 1, false)",
    );
  }
  if (hasData(data.workout_programs)) {
    sequenceResets.push(
      "SELECT setval('workout_programs_id_seq', COALESCE((SELECT MAX(id) FROM workout_programs), 0) + 1, false)",
    );
  }
  if (hasData(data.program_sessions)) {
    sequenceResets.push(
      "SELECT setval('program_sessions_id_seq', COALESCE((SELECT MAX(id) FROM program_sessions), 0) + 1, false)",
    );
  }
  if (hasData(data.program_exercises)) {
    sequenceResets.push(
      "SELECT setval('program_exercises_id_seq', COALESCE((SELECT MAX(id) FROM program_exercises), 0) + 1, false)",
    );
  }
  if (hasData(data.workout_logs)) {
    sequenceResets.push(
      "SELECT setval('workout_logs_id_seq', COALESCE((SELECT MAX(id) FROM workout_logs), 0) + 1, false)",
    );
  }
  if (hasData(data.workout_log_exercises)) {
    sequenceResets.push(
      "SELECT setval('workout_log_exercises_id_seq', COALESCE((SELECT MAX(id) FROM workout_log_exercises), 0) + 1, false)",
    );
  }
  if (hasData(data.workout_sets)) {
    sequenceResets.push(
      "SELECT setval('workout_sets_id_seq', COALESCE((SELECT MAX(id) FROM workout_sets), 0) + 1, false)",
    );
  }
  if (hasData(data.exercise_notes)) {
    sequenceResets.push(
      "SELECT setval('exercise_notes_id_seq', COALESCE((SELECT MAX(id) FROM exercise_notes), 0) + 1, false)",
    );
  }
  if (hasData(data.ai_goal_reviews)) {
    sequenceResets.push(
      "SELECT setval('ai_goal_reviews_id_seq', COALESCE((SELECT MAX(id) FROM ai_goal_reviews), 0) + 1, false)",
    );
  }
  if (hasData(data.weekly_reviews)) {
    sequenceResets.push(
      "SELECT setval('weekly_reviews_id_seq', COALESCE((SELECT MAX(id) FROM weekly_reviews), 0) + 1, false)",
    );
  }
  if (hasData(data.progress_photos)) {
    sequenceResets.push(
      "SELECT setval('progress_photos_id_seq', COALESCE((SELECT MAX(id) FROM progress_photos), 0) + 1, false)",
    );
  }

  if (sequenceResets.length > 0) {
    await db.exec(sequenceResets.join('; '));
  }
}

export function downloadBackup(zip: Uint8Array): void {
  const filename = `mypersonalfitness-backup-${getLocalDateString()}.zip`;

  const blob = new Blob([zip as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function readBackupFile(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}
