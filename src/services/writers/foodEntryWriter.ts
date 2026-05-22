import type { DB } from '../db';
import type { FoodEntry } from '../../types';

type NewFoodEntry = Omit<FoodEntry, 'id' | 'created_at' | 'updated_at'>;

function normalizeRow(row: Record<string, unknown>): FoodEntry {
  const date = row.date;
  return {
    ...row,
    date:
      date instanceof Date ? date.toISOString().split('T')[0] : String(date),
  } as FoodEntry;
}

const COLUMNS = [
  'date',
  'meal_type',
  'food_description',
  'portion_grams',
  'calories',
  'protein_g',
  'carbs_g',
  'fat_g',
  'is_ai_generated',
] as const;

const COLS_PER_ROW = COLUMNS.length;

function toParams(entry: NewFoodEntry): unknown[] {
  return [
    entry.date,
    entry.meal_type,
    entry.food_description,
    entry.portion_grams,
    entry.calories,
    entry.protein_g,
    entry.carbs_g,
    entry.fat_g,
    entry.is_ai_generated,
  ];
}

/**
 * Insert multiple food entries in one multi-row INSERT.
 * Replaces the loop-of-single-INSERTs pattern in useCalories.
 */
export async function addMany(
  db: DB,
  entries: NewFoodEntry[],
): Promise<FoodEntry[]> {
  if (entries.length === 0) return [];

  const valueClauses: string[] = [];
  const params: unknown[] = [];

  for (let i = 0; i < entries.length; i++) {
    const offset = i * COLS_PER_ROW;
    const placeholders = COLUMNS.map((_, j) => `$${offset + j + 1}`).join(', ');
    valueClauses.push(`(${placeholders})`);
    params.push(...toParams(entries[i]));
  }

  const result = await db.query(
    `INSERT INTO food_entries (${COLUMNS.join(', ')})
     VALUES ${valueClauses.join(', ')}
     RETURNING *`,
    params,
  );

  return (result.rows as Record<string, unknown>[]).map(normalizeRow);
}

/**
 * Copy all food entries from one date to another in a single INSERT...SELECT.
 * Copied entries are marked as not AI-generated.
 */
export async function copyFromDate(
  db: DB,
  sourceDate: string,
  targetDate: string,
): Promise<FoodEntry[]> {
  const result = await db.query(
    `INSERT INTO food_entries (date, meal_type, food_description, portion_grams, calories, protein_g, carbs_g, fat_g, is_ai_generated)
     SELECT $1, meal_type, food_description, portion_grams, calories, protein_g, carbs_g, fat_g, false
     FROM food_entries
     WHERE date = $2
     RETURNING *`,
    [targetDate, sourceDate],
  );

  return (result.rows as Record<string, unknown>[]).map(normalizeRow);
}
