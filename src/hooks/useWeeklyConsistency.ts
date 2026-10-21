import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { QUERY_ROOTS } from '../lib/queryKeys';
import { getDB } from '../services/db';
import {
  currentWeek,
  type WeeklyConsistencyData,
  weeklyConsistency,
} from '../services/queries/dashboard';
import { formatDate } from '../utils/date';

export type {
  DayConsistency,
  WeeklyConsistencyData,
} from '../services/queries/dashboard';

export function useWeeklyConsistency() {
  const getWeeklyConsistency =
    useCallback(async (): Promise<WeeklyConsistencyData> => {
      return weeklyConsistency(await getDB());
    }, []);

  return { getWeeklyConsistency };
}

/** The current week strip, cached per week (Write Bus refreshes it). */
export function useWeeklyConsistencyQuery() {
  const weekStart = formatDate(currentWeek().start);
  return useQuery({
    queryKey: [QUERY_ROOTS.weeklyConsistency, weekStart],
    queryFn: async () => weeklyConsistency(await getDB()),
  });
}
