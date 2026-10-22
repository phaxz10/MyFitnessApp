import type { Queryable } from './db';

// Built-in starter exercises so a fresh install (no AI key) can log a session
// straight away. Biased to home gyms: dumbbells, a bench, bands, a pull-up
// bar, bodyweight; a few barbell staples for those who have a rack.

type Row = [name: string, muscles: string, equipment: string, type?: string];

const STARTER: Row[] = [
  ['Goblet Squat', 'Legs, Glutes', 'Dumbbell'],
  ['Dumbbell Split Squat', 'Legs, Glutes', 'Dumbbells'],
  ['Bulgarian Split Squat', 'Legs, Glutes', 'Dumbbells, Bench'],
  ['Dumbbell Step-up', 'Legs, Glutes', 'Dumbbells, Bench'],
  ['Dumbbell Romanian Deadlift', 'Legs, Glutes', 'Dumbbells'],
  ['Single-leg Romanian Deadlift', 'Legs, Glutes', 'Dumbbell'],
  ['Hip Thrust', 'Glutes, Legs', 'Bench, Dumbbell'],
  ['Glute Bridge', 'Glutes', 'Bodyweight', 'reps_only'],
  ['Standing Calf Raise', 'Legs', 'Dumbbell'],
  ['Dumbbell Bench Press', 'Chest, Triceps, Shoulders', 'Dumbbells, Bench'],
  ['Incline Dumbbell Press', 'Chest, Shoulders, Triceps', 'Dumbbells, Bench'],
  ['Push-up', 'Chest, Triceps, Shoulders', 'Bodyweight', 'reps_only'],
  ['Dumbbell Fly', 'Chest', 'Dumbbells, Bench'],
  ['Seated Dumbbell Overhead Press', 'Shoulders, Triceps', 'Dumbbells, Bench'],
  ['Dumbbell Lateral Raise', 'Shoulders', 'Dumbbells'],
  ['Band Face Pull', 'Shoulders, Back', 'Resistance Band'],
  ['One-arm Dumbbell Row', 'Back, Biceps', 'Dumbbell, Bench'],
  ['Chest-supported Dumbbell Row', 'Back', 'Dumbbells, Bench'],
  ['Pull-up', 'Back, Biceps', 'Pull-up Bar', 'reps_only'],
  ['Chin-up', 'Back, Biceps', 'Pull-up Bar', 'reps_only'],
  ['Band Lat Pulldown', 'Back', 'Resistance Band'],
  ['Dumbbell Curl', 'Biceps', 'Dumbbells'],
  ['Hammer Curl', 'Biceps', 'Dumbbells'],
  ['Overhead Dumbbell Triceps Extension', 'Triceps', 'Dumbbell'],
  ['Bench Dip', 'Triceps', 'Bench', 'reps_only'],
  ["Farmer's Carry", 'Full Body, Core', 'Dumbbells', 'duration_weight'],
  ['Plank', 'Core', 'Bodyweight', 'duration'],
  ['Dead Bug', 'Core', 'Bodyweight', 'reps_only'],
  ['Hanging Knee Raise', 'Core', 'Pull-up Bar', 'reps_only'],
  ['Barbell Back Squat', 'Legs, Glutes', 'Barbell, Rack'],
  ['Barbell Deadlift', 'Legs, Glutes, Back', 'Barbell'],
  ['Barbell Bench Press', 'Chest, Triceps, Shoulders', 'Barbell, Bench, Rack'],
  ['Barbell Overhead Press', 'Shoulders, Triceps', 'Barbell'],
  ['Barbell Row', 'Back', 'Barbell'],
];

/** Seeds the starter library when the user has no exercises yet. Safe to call repeatedly. */
export async function seedStarterLibraryIfEmpty(db: Queryable): Promise<void> {
  const { rows } = await db.query<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM exercises',
  );
  if (rows[0].n > 0) return;

  const values = STARTER.map(
    (_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`,
  ).join(', ');
  await db.query(
    `INSERT INTO exercises (name, muscle_groups, equipment, exercise_type) VALUES ${values}`,
    STARTER.flatMap(([name, muscles, equipment, type]) => [
      name,
      muscles,
      equipment,
      type ?? 'reps_weight',
    ]),
  );
}
