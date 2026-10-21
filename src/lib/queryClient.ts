import { QueryClient } from '@tanstack/react-query';
import { onDbWrite } from '../services/db';
import { ROOTS_BY_TABLE } from './queryKeys';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Since we're using PGlite (IndexedDB), data is local - no need for aggressive refetching
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes (formerly cacheTime)
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

// Write Bus -> cache: a write marks every cached read family that depends on
// the written table stale (mounted views refetch). Writes are collected for
// one microtask so a burst (a transaction's COMMIT, a backup restore) costs
// one invalidation per family instead of one per row.
const pendingRoots = new Set<string>();

export function invalidateForTable(table: string): void {
  const roots = ROOTS_BY_TABLE[table];
  if (!roots) return;
  const idle = pendingRoots.size === 0;
  for (const root of roots) pendingRoots.add(root);
  if (!idle) return;
  queueMicrotask(() => {
    const roots = [...pendingRoots];
    pendingRoots.clear();
    for (const root of roots) {
      void queryClient.invalidateQueries({ queryKey: [root] });
    }
  });
}

onDbWrite((event) => invalidateForTable(event.table));
