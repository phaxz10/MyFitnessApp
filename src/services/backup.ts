import { getDB } from './db';
import { getLocalDateString } from '../utils/date';

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
    workout_sets: unknown[];
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

export async function exportData(
  options: ExportOptions = DEFAULT_EXPORT_OPTIONS,
): Promise<string> {
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
    workoutSets,
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
          'SELECT * FROM workout_sets ORDER BY workout_log_id, set_number',
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

  const backup: BackupData = {
    version: '1.2', // Bumped version for progress_photos
    exported_at: new Date().toISOString(),
    data: {
      user_profile: userProfile.rows,
      weight_logs: weightLogs.rows,
      food_entries: foodEntries.rows,
      exercises: exercises.rows,
      workout_programs: workoutPrograms.rows,
      program_sessions: programSessions.rows,
      program_exercises: programExercises.rows,
      workout_logs: workoutLogs.rows,
      workout_sets: workoutSets.rows,
      ai_goal_reviews: aiGoalReviews.rows,
      weekly_reviews: weeklyReviews.rows,
      progress_photos: progressPhotos.rows,
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
  if (hasData(data.workout_sets)) tablesToClear.push('workout_sets');
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
        `INSERT INTO user_profile (id, age, gender, height_cm, activity_level, goal, target_rate_kg_per_week, calorie_target, protein_target_g, carbs_target_g, fat_target_g, gemini_api_key, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          row.id,
          row.age,
          row.gender,
          row.height_cm,
          row.activity_level,
          row.goal,
          row.target_rate_kg_per_week,
          row.calorie_target,
          row.protein_target_g,
          row.carbs_target_g,
          row.fat_target_g,
          row.gemini_api_key,
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

  // Workout logs
  if (hasData(data.workout_logs)) {
    for (const row of data.workout_logs as Record<string, unknown>[]) {
      await db.query(
        `INSERT INTO workout_logs (id, program_id, session_id, date, started_at, ended_at, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          row.id,
          row.program_id,
          row.session_id,
          row.date,
          row.started_at,
          row.ended_at,
          row.notes,
          row.created_at,
        ],
      );
    }
  }

  // Workout sets (updated with duration_seconds)
  if (hasData(data.workout_sets)) {
    for (const row of data.workout_sets as Record<string, unknown>[]) {
      await db.query(
        `INSERT INTO workout_sets (id, workout_log_id, exercise_id, set_number, reps, weight_kg, duration_seconds, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          row.id,
          row.workout_log_id,
          row.exercise_id,
          row.set_number,
          row.reps,
          row.weight_kg,
          row.duration_seconds ?? null,
          row.notes,
          row.created_at,
        ],
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

  // Progress photos
  if (hasData(data.progress_photos)) {
    for (const row of data.progress_photos as Record<string, unknown>[]) {
      await db.query(
        `INSERT INTO progress_photos (id, date, photo_data, photo_type, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          row.id,
          row.date,
          row.photo_data,
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
  if (hasData(data.workout_sets)) {
    sequenceResets.push(
      "SELECT setval('workout_sets_id_seq', COALESCE((SELECT MAX(id) FROM workout_sets), 0) + 1, false)",
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
