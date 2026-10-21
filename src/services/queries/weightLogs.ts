/** Weight log queries. */

import type { WeightLog } from '../../types';
import type { Queryable } from '../db';

/** The weight log for one calendar day ('yyyy-MM-dd'), or null. */
export async function weightLogForDate(
  db: Queryable,
  date: string,
): Promise<WeightLog | null> {
  const result = await db.query('SELECT * FROM weight_logs WHERE date = $1', [
    date,
  ]);
  return (result.rows[0] as WeightLog | undefined) ?? null;
}
