/// <reference lib="webworker" />
import { PGlite } from '@electric-sql/pglite';
import { worker } from '@electric-sql/pglite/worker';
import { runPendingMigrations } from './migrator';

// A failed open is broadcast so no tab waits forever. Same name as in db.ts
// (not imported: importing this module would start a worker loop there).
const DB_OPEN_ERROR_CHANNEL = 'mypersonalfitness-db-open-error';

// The one PGlite that owns idb://mypersonalfitness. Every tab starts this
// worker, but PGliteWorker's leader election (navigator.locks) lets only one
// of them run `init`: the others forward their queries to the leader, so the
// IndexedDB data dir has a single writer across tabs. Migrations run here,
// before the leader serves any tab, so they run once per open and no query
// sees a half-migrated schema. Default durability: each statement is flushed
// to IndexedDB before its result is returned (never relaxedDurability).
worker({
  async init(options) {
    try {
      const pg = new PGlite({ dataDir: options.dataDir });
      await runPendingMigrations(pg);
      return pg;
    } catch (err) {
      // Without this every tab's queries would hang: they wait for a leader
      // connection that never comes. Each tab rejects getDB() instead.
      const message = err instanceof Error ? err.message : String(err);
      const channel = new BroadcastChannel(DB_OPEN_ERROR_CHANNEL);
      channel.postMessage({ message });
      channel.close();
      throw err;
    }
  },
});
