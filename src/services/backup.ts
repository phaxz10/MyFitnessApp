import { getDB } from './db';

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
  };
}

export async function exportData(): Promise<string> {
  const db = await getDB();

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
  ] = await Promise.all([
    db.query('SELECT * FROM user_profile'),
    db.query('SELECT * FROM weight_logs ORDER BY date'),
    db.query('SELECT * FROM food_entries ORDER BY date, id'),
    db.query('SELECT * FROM exercises ORDER BY id'),
    db.query('SELECT * FROM workout_programs ORDER BY id'),
    db.query('SELECT * FROM program_sessions ORDER BY program_id, order_index'),
    db.query('SELECT * FROM program_exercises ORDER BY session_id, order_index'),
    db.query('SELECT * FROM workout_logs ORDER BY date'),
    db.query('SELECT * FROM workout_sets ORDER BY workout_log_id, set_number'),
    db.query('SELECT * FROM ai_goal_reviews ORDER BY review_date'),
  ]);

  const backup: BackupData = {
    version: '1.0',
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

  // Clear existing data (in reverse order of dependencies)
  await db.exec(`
    DELETE FROM ai_goal_reviews;
    DELETE FROM workout_sets;
    DELETE FROM workout_logs;
    DELETE FROM program_exercises;
    DELETE FROM program_sessions;
    DELETE FROM workout_programs;
    DELETE FROM exercises;
    DELETE FROM food_entries;
    DELETE FROM weight_logs;
    DELETE FROM user_profile;
  `);

  // Import data in order of dependencies
  const { data } = backup;

  // User profile
  for (const row of data.user_profile as Record<string, unknown>[]) {
    await db.query(
      `INSERT INTO user_profile (id, age, gender, height_cm, activity_level, goal, target_rate_kg_per_week, calorie_target, protein_target_g, carbs_target_g, fat_target_g, gemini_api_key, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [row.id, row.age, row.gender, row.height_cm, row.activity_level, row.goal, row.target_rate_kg_per_week, row.calorie_target, row.protein_target_g, row.carbs_target_g, row.fat_target_g, row.gemini_api_key, row.created_at, row.updated_at]
    );
  }

  // Weight logs
  for (const row of data.weight_logs as Record<string, unknown>[]) {
    await db.query(
      `INSERT INTO weight_logs (id, date, weight_kg, waist_cm, neck_cm, arm_cm, body_fat_pct, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [row.id, row.date, row.weight_kg, row.waist_cm, row.neck_cm, row.arm_cm, row.body_fat_pct, row.created_at, row.updated_at]
    );
  }

  // Food entries
  for (const row of data.food_entries as Record<string, unknown>[]) {
    await db.query(
      `INSERT INTO food_entries (id, date, meal_type, food_description, portion_grams, calories, protein_g, carbs_g, fat_g, is_ai_generated, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [row.id, row.date, row.meal_type, row.food_description, row.portion_grams, row.calories, row.protein_g, row.carbs_g, row.fat_g, row.is_ai_generated, row.created_at, row.updated_at]
    );
  }

  // Exercises
  for (const row of data.exercises as Record<string, unknown>[]) {
    await db.query(
      `INSERT INTO exercises (id, name, description, muscle_groups, equipment, is_ai_generated, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [row.id, row.name, row.description, row.muscle_groups, row.equipment, row.is_ai_generated, row.created_at]
    );
  }

  // Workout programs
  for (const row of data.workout_programs as Record<string, unknown>[]) {
    await db.query(
      `INSERT INTO workout_programs (id, name, description, sessions_per_week, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [row.id, row.name, row.description, row.sessions_per_week, row.is_active, row.created_at, row.updated_at]
    );
  }

  // Program sessions
  for (const row of data.program_sessions as Record<string, unknown>[]) {
    await db.query(
      `INSERT INTO program_sessions (id, program_id, name, day_of_week, order_index, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [row.id, row.program_id, row.name, row.day_of_week, row.order_index, row.created_at]
    );
  }

  // Program exercises
  for (const row of data.program_exercises as Record<string, unknown>[]) {
    await db.query(
      `INSERT INTO program_exercises (id, session_id, exercise_id, target_sets, target_rep_min, target_rep_max, order_index, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [row.id, row.session_id, row.exercise_id, row.target_sets, row.target_rep_min, row.target_rep_max, row.order_index, row.notes]
    );
  }

  // Workout logs
  for (const row of data.workout_logs as Record<string, unknown>[]) {
    await db.query(
      `INSERT INTO workout_logs (id, program_id, session_id, date, started_at, ended_at, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [row.id, row.program_id, row.session_id, row.date, row.started_at, row.ended_at, row.notes, row.created_at]
    );
  }

  // Workout sets
  for (const row of data.workout_sets as Record<string, unknown>[]) {
    await db.query(
      `INSERT INTO workout_sets (id, workout_log_id, exercise_id, set_number, reps, weight_kg, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [row.id, row.workout_log_id, row.exercise_id, row.set_number, row.reps, row.weight_kg, row.notes, row.created_at]
    );
  }

  // AI goal reviews
  for (const row of data.ai_goal_reviews as Record<string, unknown>[]) {
    await db.query(
      `INSERT INTO ai_goal_reviews (id, review_date, previous_calorie_target, new_calorie_target, previous_goal, new_goal_suggestion, ai_analysis, was_accepted, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [row.id, row.review_date, row.previous_calorie_target, row.new_calorie_target, row.previous_goal, row.new_goal_suggestion, row.ai_analysis, row.was_accepted, row.created_at]
    );
  }

  // Reset sequences
  await db.exec(`
    SELECT setval('weight_logs_id_seq', COALESCE((SELECT MAX(id) FROM weight_logs), 0) + 1, false);
    SELECT setval('food_entries_id_seq', COALESCE((SELECT MAX(id) FROM food_entries), 0) + 1, false);
    SELECT setval('exercises_id_seq', COALESCE((SELECT MAX(id) FROM exercises), 0) + 1, false);
    SELECT setval('workout_programs_id_seq', COALESCE((SELECT MAX(id) FROM workout_programs), 0) + 1, false);
    SELECT setval('program_sessions_id_seq', COALESCE((SELECT MAX(id) FROM program_sessions), 0) + 1, false);
    SELECT setval('program_exercises_id_seq', COALESCE((SELECT MAX(id) FROM program_exercises), 0) + 1, false);
    SELECT setval('workout_logs_id_seq', COALESCE((SELECT MAX(id) FROM workout_logs), 0) + 1, false);
    SELECT setval('workout_sets_id_seq', COALESCE((SELECT MAX(id) FROM workout_sets), 0) + 1, false);
    SELECT setval('ai_goal_reviews_id_seq', COALESCE((SELECT MAX(id) FROM ai_goal_reviews), 0) + 1, false);
  `);
}

export function downloadBackup(jsonString: string): void {
  const date = new Date().toISOString().split('T')[0];
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
