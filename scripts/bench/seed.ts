import type { PGlite } from '@electric-sql/pglite';

/**
 * Seed a heavy three-year user: 600 Workout Logs (~19.8k Sets) over 250
 * Exercises, 5k Food Entries, 1k weight logs and 150 progress photos of
 * ~300KB base64 each. Dates end today, so the 7d/30d windows have data.
 * Deterministic (setseed), so runs compare like for like.
 */
export async function seedHeavyUser(db: PGlite): Promise<void> {
  await db.exec(`SELECT setseed(0.42)`);
  await db.exec(`
    INSERT INTO user_profile (birthdate, gender, height_cm, activity_level, goal, calorie_target, protein_target_g, carbs_target_g, fat_target_g)
      VALUES ('1990-01-01', 'male', 180, 'moderate', 'bulk', 2500, 180, 250, 80);
    INSERT INTO exercises (name, muscle_groups) SELECT 'Ex ' || g, 'chest,triceps' FROM generate_series(1, 250) g;
    INSERT INTO workout_programs (name, sessions_per_week, is_active) VALUES ('P', 4, true);
    INSERT INTO program_sessions (program_id, name, day_of_week, order_index) SELECT 1, 'S' || g, g, g FROM generate_series(0, 3) g;
    INSERT INTO program_exercises (session_id, exercise_id, target_sets, target_rep_min, target_rep_max, order_index)
      SELECT 1 + (g % 4), 1 + (g * 7) % 60, 3, 8, 12, g FROM generate_series(0, 23) g;
    INSERT INTO workout_logs (program_id, session_id, date, started_at, ended_at, status)
      SELECT 1, 1 + (g % 4),
             CURRENT_DATE - ((600 - g) * 1.8)::int,
             (CURRENT_DATE - ((600 - g) * 1.8)::int) + TIME '09:00',
             (CURRENT_DATE - ((600 - g) * 1.8)::int) + TIME '10:00',
             'completed'
      FROM generate_series(1, 600) g;
    -- 6 exercises per log, skewed: the first four from the top 60
    INSERT INTO workout_log_exercises (workout_log_id, exercise_id, order_index)
      SELECT l, 1 + ((l * 7 + k * 13) % (CASE WHEN k < 4 THEN 60 ELSE 250 END)), k
      FROM generate_series(1, 600) l, generate_series(0, 5) k;
    INSERT INTO workout_sets (workout_log_id, exercise_id, workout_log_exercise_id, set_number, reps, weight_kg, completed_at, created_at)
      SELECT wle.workout_log_id, wle.exercise_id, wle.id, s,
             5 + (random() * 8)::int, 20 + random() * 100,
             now(), now() + s * INTERVAL '1 second'
      FROM workout_log_exercises wle, generate_series(1, 5 + (wle.id % 2)) s;
    INSERT INTO food_entries (date, meal_type, food_description, portion_grams, calories, protein_g, carbs_g, fat_g)
      SELECT CURRENT_DATE - 1000 + (g / 5), 'lunch', 'Food ' || (g % 300), 200, 500, 30, 50, 15
      FROM generate_series(1, 5000) g;
    INSERT INTO weight_logs (date, weight_kg) SELECT CURRENT_DATE - 1000 + g, 80 FROM generate_series(1, 1000) g;
  `);

  // ~300KB base64 per photo (a phone shot after compressImage).
  const bytes = new Uint8Array(225_000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 2654435761) >>> 24;
  const photo = `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`;
  for (let i = 0; i < 150; i++) {
    await db.query(
      `INSERT INTO progress_photos (date, photo_data) VALUES (CURRENT_DATE - 1050 + $1::int * 7, $2)`,
      [i, photo],
    );
  }
  await db.exec('ANALYZE');
}
