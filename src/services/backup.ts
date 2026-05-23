import { getLocalDateString } from '../utils/date';
import { getDB } from './db';

interface BackupData {
  version: string;
  syncVersion?: number; // Auto-incrementing version for cross-device sync
  deviceId?: string; // Identifies which device created this backup
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

const SENSITIVE_FIELD_REGEX = /api_key/i;

const stripSensitiveFields = (
  row: Record<string, unknown>,
): Record<string, unknown> => {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (SENSITIVE_FIELD_REGEX.test(key)) {
      continue;
    }
    sanitized[key] = value;
  }

  return sanitized;
};

const sanitizeRows = (rows: unknown[]): unknown[] =>
  rows.map((row) =>
    row && typeof row === 'object'
      ? stripSensitiveFields(row as Record<string, unknown>)
      : row,
  );

export interface SyncMetadata {
  syncVersion?: number;
  deviceId?: string;
}

export interface ExportDataOptions {
  options?: ExportOptions;
  syncMetadata?: SyncMetadata;
  /** When true, strip sensitive fields (api keys). Defaults to true for manual exports, false for Drive backups. */
  stripSecrets?: boolean;
}

export async function exportData(
  optionsOrConfig: ExportOptions | ExportDataOptions = DEFAULT_EXPORT_OPTIONS,
  syncMetadata?: SyncMetadata,
): Promise<string> {
  // Support both old signature (options, syncMetadata) and new config object
  let options: ExportOptions;
  let stripSecrets: boolean;
  if ('userProfile' in optionsOrConfig) {
    // Old call signature: exportData(ExportOptions, SyncMetadata?)
    options = optionsOrConfig;
    stripSecrets = true;
  } else {
    // New call signature: exportData(ExportDataOptions)
    options = optionsOrConfig.options ?? DEFAULT_EXPORT_OPTIONS;
    syncMetadata = optionsOrConfig.syncMetadata ?? syncMetadata;
    stripSecrets = optionsOrConfig.stripSecrets ?? true;
  }

  const processRows = (rows: unknown[]): unknown[] =>
    stripSecrets ? sanitizeRows(rows) : rows;

  const db = await getDB();

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
    options.userProfile
      ? db.query('SELECT * FROM user_profile')
      : Promise.resolve({ rows: [] }),
    options.weightLogs
      ? db.query('SELECT * FROM weight_logs ORDER BY date')
      : Promise.resolve({ rows: [] }),
    options.calorieLogs
      ? db.query('SELECT * FROM food_entries ORDER BY date, id')
      : Promise.resolve({ rows: [] }),
    options.exercises
      ? db.query('SELECT * FROM exercises ORDER BY id')
      : Promise.resolve({ rows: [] }),
    options.workoutPrograms
      ? db.query('SELECT * FROM workout_programs ORDER BY id')
      : Promise.resolve({ rows: [] }),
    options.workoutPrograms
      ? db.query(
          'SELECT * FROM program_sessions ORDER BY program_id, order_index',
        )
      : Promise.resolve({ rows: [] }),
    options.workoutPrograms
      ? db.query(
          'SELECT * FROM program_exercises ORDER BY session_id, order_index',
        )
      : Promise.resolve({ rows: [] }),
    options.workoutHistory
      ? db.query('SELECT * FROM workout_logs ORDER BY date')
      : Promise.resolve({ rows: [] }),
    options.workoutHistory
      ? db.query(
          'SELECT * FROM workout_log_exercises ORDER BY workout_log_id, order_index',
        )
      : Promise.resolve({ rows: [] }),
    options.workoutHistory
      ? db.query(
          'SELECT * FROM workout_sets ORDER BY workout_log_id, set_number',
        )
      : Promise.resolve({ rows: [] }),
    options.exercises
      ? db.query(
          'SELECT * FROM exercise_notes ORDER BY exercise_id, created_at',
        )
      : Promise.resolve({ rows: [] }),
    options.aiReviews
      ? db.query('SELECT * FROM ai_goal_reviews ORDER BY review_date')
      : Promise.resolve({ rows: [] }),
    options.aiReviews
      ? db.query('SELECT * FROM weekly_reviews ORDER BY week_start')
      : Promise.resolve({ rows: [] }),
    options.progressPhotos
      ? db.query('SELECT * FROM progress_photos ORDER BY date, created_at')
      : Promise.resolve({ rows: [] }),
  ]);

  const sanitizedUserProfile = processRows(userProfile.rows);
  const sanitizedWeightLogs = processRows(weightLogs.rows);
  const sanitizedFoodEntries = processRows(foodEntries.rows);
  const sanitizedExercises = processRows(exercises.rows);
  const sanitizedWorkoutPrograms = processRows(workoutPrograms.rows);
  const sanitizedProgramSessions = processRows(programSessions.rows);
  const sanitizedProgramExercises = processRows(programExercises.rows);
  const sanitizedWorkoutLogs = processRows(workoutLogs.rows);
  const sanitizedWorkoutLogExercises = processRows(workoutLogExercises.rows);
  const sanitizedWorkoutSets = processRows(workoutSets.rows);
  const sanitizedExerciseNotes = processRows(exerciseNotes.rows);
  const sanitizedAiGoalReviews = processRows(aiGoalReviews.rows);
  const sanitizedWeeklyReviews = processRows(weeklyReviews.rows);
  const sanitizedProgressPhotos = processRows(progressPhotos.rows);

  const backup: BackupData = {
    version: '1.7', // Bumped version for birthdate field migration
    ...(syncMetadata?.syncVersion !== undefined && {
      syncVersion: syncMetadata.syncVersion,
    }),
    ...(syncMetadata?.deviceId && { deviceId: syncMetadata.deviceId }),
    exported_at: new Date().toISOString(),
    data: {
      user_profile: sanitizedUserProfile,
      weight_logs: sanitizedWeightLogs,
      food_entries: sanitizedFoodEntries,
      exercises: sanitizedExercises,
      workout_programs: sanitizedWorkoutPrograms,
      program_sessions: sanitizedProgramSessions,
      program_exercises: sanitizedProgramExercises,
      workout_logs: sanitizedWorkoutLogs,
      workout_log_exercises: sanitizedWorkoutLogExercises,
      workout_sets: sanitizedWorkoutSets,
      exercise_notes: sanitizedExerciseNotes,
      ai_goal_reviews: sanitizedAiGoalReviews,
      weekly_reviews: sanitizedWeeklyReviews,
      progress_photos: sanitizedProgressPhotos,
    },
  };

  return JSON.stringify(backup, null, 2);
}

export async function importData(jsonString: string): Promise<void> {
  const db = await getDB();

  let backup: BackupData;
  try {
    backup = JSON.parse(jsonString);
  } catch {
    throw new Error('Invalid JSON file');
  }

  // Validate structure
  if (!backup.version || !backup.data) {
    throw new Error('Invalid backup file structure');
  }

  const { data } = backup;

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
  // User profile
  if (hasData(data.user_profile)) {
    for (const row of data.user_profile as Record<string, unknown>[]) {
      await db.query(
        `INSERT INTO user_profile (id, birthdate, gender, height_cm, activity_level, goal, calorie_target, protein_target_g, carbs_target_g, fat_target_g, openai_api_key, openai_proxy_url, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          row.id,
          row.birthdate ?? getLocalDateString(),
          row.gender,
          row.height_cm,
          row.activity_level,
          row.goal,
          row.calorie_target,
          row.protein_target_g,
          row.carbs_target_g,
          row.fat_target_g,
          row.openai_api_key ?? null,
          row.openai_proxy_url ?? null,
          row.created_at,
          row.updated_at,
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
          row.weight_kg ?? null,
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

  // Progress photos (photo_data may be null when restoring from Google Drive)
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

export function downloadBackup(jsonString: string): void {
  const date = getLocalDateString();
  const filename = `mypersonalfitness-backup-${date}.json`;

  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function readBackupFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
