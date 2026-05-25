import { DEFAULT_EXPORT_OPTIONS, exportData, importData } from './backup';
import { getDB, onDbWrite } from './db';
import { getAccessToken, getGoogleAuthStatus, isSignedIn } from './googleAuth';
import {
  downloadBackupJson,
  downloadPhoto,
  getLastBackupTime,
  getLastRestoredAt,
  getRemoteExportedAt,
  listRemotePhotos,
  setLastRestoredAt,
  uploadBackupJson,
  uploadPhoto,
} from './googleDrive';

// Clean up old GitHub backup localStorage keys (one-time migration)
for (const key of [
  'mpf-github-token',
  'mpf-gist-id',
  'mpf-sync-version',
  'mpf-device-id',
]) {
  localStorage.removeItem(key);
}

// ---------------------------------------------------------------------------
// Export for structured data — strips photo_data from progress_photos rows
// ---------------------------------------------------------------------------

async function exportForDrive(): Promise<string> {
  const json = await exportData({
    options: DEFAULT_EXPORT_OPTIONS,
    stripSecrets: false,
  });
  const backup = JSON.parse(json);

  if (Array.isArray(backup.data?.progress_photos)) {
    backup.data.progress_photos = backup.data.progress_photos.map(
      (row: Record<string, unknown>) => {
        const { photo_data: _, ...rest } = row;
        return rest;
      },
    );
  }

  return JSON.stringify(backup);
}

// ---------------------------------------------------------------------------
// Photo sync — upload any local photos not yet on Drive
// ---------------------------------------------------------------------------

async function syncPhotos(): Promise<void> {
  const db = await getDB();
  const result = await db.query<{ id: number; photo_data: string | null }>(
    'SELECT id, photo_data FROM progress_photos WHERE photo_data IS NOT NULL ORDER BY id',
  );

  if (result.rows.length === 0) return;

  const remoteIds = new Set(await listRemotePhotos());
  const toUpload = result.rows.filter((r) => !remoteIds.has(String(r.id)));

  for (const row of toUpload) {
    if (row.photo_data) {
      try {
        await uploadPhoto(row.id, row.photo_data);
      } catch (err) {
        console.warn(`Failed to upload photo-${row.id}:`, err);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Lazy-load photos — download photos with NULL photo_data from Drive
// ---------------------------------------------------------------------------

let lazyLoadRunning = false;

export async function lazyLoadPhotos(): Promise<void> {
  if (lazyLoadRunning) return;
  lazyLoadRunning = true;

  try {
    const db = await getDB();
    const result = await db.query<{ id: number }>(
      'SELECT id FROM progress_photos WHERE photo_data IS NULL ORDER BY id',
    );

    for (const row of result.rows) {
      try {
        const dataUrl = await downloadPhoto(row.id);
        if (dataUrl) {
          await db.query(
            'UPDATE progress_photos SET photo_data = $1 WHERE id = $2',
            [dataUrl, row.id],
          );
        }
      } catch (err) {
        console.warn(`Failed to download photo-${row.id}:`, err);
      }
    }
  } finally {
    lazyLoadRunning = false;
  }
}

// ---------------------------------------------------------------------------
// Restore-on-load: pull remote if newer than local
// ---------------------------------------------------------------------------

// Called on app startup. Compares remote backup's exported_at timestamp
// against the local last-restored-at marker. If remote is newer (e.g. user
// restored on another device), pulls and imports the remote backup, then
// kicks off a background photo download for any photos with NULL photo_data.
export async function restoreIfRemoteNewer(): Promise<boolean> {
  if (!isSignedIn()) return false;

  try {
    const remoteExportedAt = await getRemoteExportedAt();
    if (!remoteExportedAt) return false;

    const localRestoredAt = getLastRestoredAt();
    if (
      localRestoredAt &&
      new Date(remoteExportedAt) <= new Date(localRestoredAt)
    ) {
      return false;
    }

    const json = await downloadBackupJson();
    if (!json) return false;

    await importData(json);
    setLastRestoredAt(remoteExportedAt);

    lazyLoadPhotos().catch((err) =>
      console.warn('Photo lazy-load failed:', err),
    );
    return true;
  } catch (err) {
    console.warn('Restore-on-load failed:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Full backup to Google Drive: called from onboarding restore too
// ---------------------------------------------------------------------------

// Throws on real failure (network, parse, partial DB restore). Returns false
// only when there's no remote backup, or the remote backup carries no profile
// row (i.e. the caller is expected to continue with manual onboarding).
//
// Previously this swallowed all errors and silently returned false — which
// hid mid-restore failures behind "looks fine but exercises are missing".
export async function restoreFromDrive(): Promise<boolean> {
  const json = await downloadBackupJson();
  if (!json) return false;

  const backup = JSON.parse(json);
  const hasProfile =
    backup.data?.user_profile && backup.data.user_profile.length > 0;

  await importData(json);

  if (backup.exported_at) {
    setLastRestoredAt(backup.exported_at);
  }

  lazyLoadPhotos().catch((err) =>
    console.warn('Photo lazy-load failed:', err),
  );
  return hasProfile;
}

// ---------------------------------------------------------------------------
// Perform auto backup
// ---------------------------------------------------------------------------

export interface AutoBackupResult {
  success: boolean;
  error?: string;
}

export async function performAutoBackup(): Promise<AutoBackupResult> {
  if (!isSignedIn()) {
    return { success: false, error: 'Not signed in with Google' };
  }
  if (!(await getAccessToken())) {
    return {
      success: false,
      error:
        'Google session expired. Reconnect Google Drive to resume backups.',
    };
  }

  try {
    const jsonString = await exportForDrive();
    await uploadBackupJson(jsonString);
    await syncPhotos();
    return { success: true };
  } catch (error) {
    console.error('Auto backup failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// Backup status
// ---------------------------------------------------------------------------

export interface BackupStatus {
  lastBackup: string | null;
  isReady: boolean;
  needsReconnect: boolean;
}

export function getBackupStatus(): BackupStatus {
  const authStatus = getGoogleAuthStatus();
  return {
    lastBackup: getLastBackupTime(),
    isReady: !!authStatus.user && authStatus.hasValidAccessToken,
    needsReconnect: authStatus.needsReconnect,
  };
}

export function isAutoBackupEnabled(): boolean {
  const authStatus = getGoogleAuthStatus();
  return !!authStatus.user && authStatus.hasValidAccessToken;
}

// ---------------------------------------------------------------------------
// Write Bus debounce — 60-second debounce triggers backup on any mutation
// ---------------------------------------------------------------------------

// MODULE SIDE EFFECT: subscribes to the Write Bus at import time.
// This is intentional — the backup listener must capture ALL database mutations
// (from any UI path), not just writes triggered by specific components.
// The 60-second debounce batches rapid writes (e.g. logging 5 sets in a row)
// into a single backup upload. Failures are logged but never block the user —
// backup is best-effort and should never interrupt a workout.
let backupTimeout: ReturnType<typeof setTimeout> | null = null;
const BACKUP_DEBOUNCE_MS = 60_000;

onDbWrite(() => {
  if (!isAutoBackupEnabled()) return;

  if (backupTimeout) clearTimeout(backupTimeout);

  backupTimeout = setTimeout(async () => {
    try {
      const result = await performAutoBackup();
      if (result.success) {
        console.log('Auto-backup to Google Drive successful');
      } else {
        console.warn('Auto-backup failed:', result.error);
      }
    } catch (err) {
      console.error('Auto-backup error:', err);
    } finally {
      backupTimeout = null;
    }
  }, BACKUP_DEBOUNCE_MS);
});
