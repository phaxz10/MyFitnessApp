import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addMany, copyFromDate } from './foodEntryWriter';

const SCHEMA = `
  CREATE TABLE food_entries (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
    food_description TEXT NOT NULL,
    portion_grams REAL NOT NULL,
    calories INTEGER NOT NULL,
    protein_g REAL NOT NULL,
    carbs_g REAL NOT NULL,
    fat_g REAL NOT NULL,
    is_ai_generated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
});

afterEach(async () => {
  await db.close();
});

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    date: '2025-06-01',
    meal_type: 'lunch' as const,
    food_description: 'Chicken breast',
    portion_grams: 200,
    calories: 330,
    protein_g: 62,
    carbs_g: 0,
    fat_g: 7,
    is_ai_generated: true,
    ...overrides,
  };
}

describe('addMany', () => {
  it('inserts multiple entries in one call and returns them', async () => {
    const entries = [
      makeEntry({ food_description: 'Rice', calories: 200 }),
      makeEntry({ food_description: 'Chicken', calories: 330 }),
      makeEntry({ food_description: 'Broccoli', calories: 55 }),
    ];

    const result = await addMany(db, entries);

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.food_description)).toEqual([
      'Rice',
      'Chicken',
      'Broccoli',
    ]);
    expect(result.every((r) => typeof r.id === 'number')).toBe(true);
  });

  it('returns empty array for empty input', async () => {
    const result = await addMany(db, []);
    expect(result).toEqual([]);
  });

  it('inserts a single entry correctly', async () => {
    const result = await addMany(db, [makeEntry()]);

    expect(result).toHaveLength(1);
    expect(result[0].calories).toBe(330);
    expect(result[0].is_ai_generated).toBe(true);
  });

  it('persists rows in the database', async () => {
    await addMany(db, [makeEntry(), makeEntry({ meal_type: 'dinner' })]);

    const count = await db.query('SELECT COUNT(*) as n FROM food_entries');
    expect((count.rows as { n: number }[])[0].n).toBe(2);
  });

  it('preserves all column values', async () => {
    const entry = makeEntry({
      date: '2025-07-15',
      meal_type: 'snack',
      food_description: 'Almonds',
      portion_grams: 30,
      calories: 170,
      protein_g: 6,
      carbs_g: 6,
      fat_g: 15,
      is_ai_generated: false,
    });

    const [row] = await addMany(db, [entry]);

    expect(row.meal_type).toBe('snack');
    expect(row.food_description).toBe('Almonds');
    expect(row.portion_grams).toBe(30);
    expect(row.protein_g).toBe(6);
    expect(row.is_ai_generated).toBe(false);
  });
});

describe('copyFromDate', () => {
  it('copies all entries from source to target date', async () => {
    await addMany(db, [
      makeEntry({ date: '2025-06-01', food_description: 'Oats' }),
      makeEntry({ date: '2025-06-01', food_description: 'Eggs' }),
    ]);

    const copied = await copyFromDate(db, '2025-06-01', '2025-06-02');

    expect(copied).toHaveLength(2);
    expect(copied.every((r) => r.date === '2025-06-02')).toBe(true);
    expect(copied.map((r) => r.food_description).sort()).toEqual([
      'Eggs',
      'Oats',
    ]);
  });

  it('marks copied entries as not AI-generated', async () => {
    await addMany(db, [
      makeEntry({ date: '2025-06-01', is_ai_generated: true }),
    ]);

    const [copied] = await copyFromDate(db, '2025-06-01', '2025-06-02');

    expect(copied.is_ai_generated).toBe(false);
  });

  it('returns empty array when source date has no entries', async () => {
    const result = await copyFromDate(db, '2025-01-01', '2025-01-02');
    expect(result).toEqual([]);
  });

  it('does not modify source entries', async () => {
    await addMany(db, [makeEntry({ date: '2025-06-01' })]);
    await copyFromDate(db, '2025-06-01', '2025-06-02');

    const source = await db.query(
      "SELECT * FROM food_entries WHERE date = '2025-06-01'",
    );
    expect(source.rows).toHaveLength(1);

    const total = await db.query('SELECT COUNT(*) as n FROM food_entries');
    expect((total.rows as { n: number }[])[0].n).toBe(2);
  });
});
