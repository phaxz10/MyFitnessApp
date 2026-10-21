import { useQuery } from '@tanstack/react-query';
import { QUERY_ROOTS as R } from '../lib/queryKeys';
import { getDB } from '../services/db';
import {
  activeProgram,
  firstWeight,
  foodEntriesForDate,
  latestWeightLog,
  resumableWorkout,
  sessionStatusForDate,
} from '../services/queries/dashboard';
import { recent } from '../services/queries/workoutHistory';

// Cached reads behind the Dashboard. Keys start with a QUERY_ROOTS family so
// the Write Bus invalidates them when their tables change (queryClient.ts);
// revisiting the Dashboard serves the cache instead of ~20 fresh queries.

export const dashboardKeys = {
  foodForDate: (date: string) => [R.foodEntries, 'byDate', date] as const,
  recentLogs: (limit: number) => [R.workoutLogs, 'recent', limit] as const,
  resumable: () => [R.workoutLogs, 'resumable'] as const,
  sessionStatus: (sessionId: number, date: string) =>
    [R.workoutLogs, 'sessionStatus', sessionId, date] as const,
  latestWeight: () => [R.weightLogs, 'latest'] as const,
  firstWeight: () => [R.weightLogs, 'first'] as const,
  activeProgram: () => [R.programs, 'active'] as const,
};

export function useFoodEntriesForDate(date: string) {
  return useQuery({
    queryKey: dashboardKeys.foodForDate(date),
    queryFn: async () => foodEntriesForDate(await getDB(), date),
  });
}

export function useRecentWorkoutLogs(limit: number) {
  return useQuery({
    queryKey: dashboardKeys.recentLogs(limit),
    queryFn: async () => recent(await getDB(), limit),
  });
}

export function useResumableWorkout() {
  return useQuery({
    queryKey: dashboardKeys.resumable(),
    queryFn: async () => resumableWorkout(await getDB()),
  });
}

export function useSessionStatus(sessionId: number | null, date: string) {
  return useQuery({
    queryKey: dashboardKeys.sessionStatus(sessionId ?? 0, date),
    queryFn: async () =>
      sessionStatusForDate(await getDB(), sessionId as number, date),
    enabled: sessionId != null,
  });
}

export function useLatestWeightLog() {
  return useQuery({
    queryKey: dashboardKeys.latestWeight(),
    queryFn: async () => latestWeightLog(await getDB()),
  });
}

export function useFirstWeight() {
  return useQuery({
    queryKey: dashboardKeys.firstWeight(),
    queryFn: async () => firstWeight(await getDB()),
  });
}

export function useActiveProgram() {
  return useQuery({
    queryKey: dashboardKeys.activeProgram(),
    queryFn: async () => activeProgram(await getDB()),
  });
}
