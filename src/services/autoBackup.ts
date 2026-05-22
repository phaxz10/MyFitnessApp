import type { SyncMetadata } from './backup';
import { DEFAULT_EXPORT_OPTIONS, exportData } from './backup';

const GITHUB_GIST_API = 'https://api.github.com/gists';
const BACKUP_FILENAME = 'mypersonalfitness-backup.json';
const GIST_DESCRIPTION = 'MyPersonalFitness Auto Backup';

// Storage keys
const STORAGE_KEYS = {
  GITHUB_TOKEN: 'mpf-github-token',
  GIST_ID: 'mpf-gist-id',
  LAST_BACKUP: 'mpf-last-backup',
  SYNC_VERSION: 'mpf-sync-version',
  DEVICE_ID: 'mpf-device-id',
} as const;

export interface AutoBackupConfig {
  githubToken: string;
  gistId?: string;
}

export interface BackupStatus {
  lastBackup: string | null;
  gistId: string | null;
  gistUrl: string | null;
  isConfigured: boolean;
  syncVersion: number;
  deviceId: string;
}

/**
 * Save GitHub token to localStorage
 */
export function saveGithubToken(token: string): void {
  localStorage.setItem(STORAGE_KEYS.GITHUB_TOKEN, token);
}

/**
 * Get GitHub token from localStorage
 */
export function getGithubToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.GITHUB_TOKEN);
}

/**
 * Remove GitHub token from localStorage
 */
export function removeGithubToken(): void {
  localStorage.removeItem(STORAGE_KEYS.GITHUB_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.GIST_ID);
  localStorage.removeItem(STORAGE_KEYS.LAST_BACKUP);
  // Note: We keep SYNC_VERSION and DEVICE_ID as they may be useful for future re-connection
}

/**
 * Get the stored Gist ID
 */
export function getGistId(): string | null {
  return localStorage.getItem(STORAGE_KEYS.GIST_ID);
}

/**
 * Save Gist ID to localStorage
 */
export function saveGistId(gistId: string): void {
  localStorage.setItem(STORAGE_KEYS.GIST_ID, gistId);
}

/**
 * Generate a unique device ID (8-char hex string)
 */
function generateDeviceId(): string {
  const array = new Uint8Array(4);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get or create device ID for this device
 */
export function getDeviceId(): string {
  let deviceId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
  if (!deviceId) {
    deviceId = generateDeviceId();
    localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
  }
  return deviceId;
}

/**
 * Get current sync version (local)
 */
export function getSyncVersion(): number {
  const stored = localStorage.getItem(STORAGE_KEYS.SYNC_VERSION);
  return stored ? parseInt(stored, 10) : 0;
}

/**
 * Save sync version to localStorage
 */
export function saveSyncVersion(version: number): void {
  localStorage.setItem(STORAGE_KEYS.SYNC_VERSION, version.toString());
}

/**
 * Increment and return the new sync version
 */
export function incrementSyncVersion(): number {
  const current = getSyncVersion();
  const next = current + 1;
  saveSyncVersion(next);
  return next;
}

/**
 * Metadata extracted from a remote backup for sync comparison
 */
export interface RemoteBackupMetadata {
  syncVersion: number;
  deviceId: string | null;
  exportedAt: string;
}

/**
 * Parse backup metadata from JSON string (without parsing full data)
 * This is efficient for conflict detection without loading entire backup
 */
export function parseBackupMetadata(
  backupJson: string,
): RemoteBackupMetadata | null {
  try {
    const backup = JSON.parse(backupJson);
    return {
      syncVersion: backup.syncVersion ?? 0,
      deviceId: backup.deviceId ?? null,
      exportedAt: backup.exported_at ?? '',
    };
  } catch {
    return null;
  }
}

/**
 * Sync conflict detection result
 */
export interface SyncConflictResult {
  hasConflict: boolean;
  localVersion: number;
  remoteVersion: number;
  remoteDeviceId: string | null;
  remoteExportedAt: string;
}

/**
 * Check if there's a sync conflict (remote is newer than local)
 */
export async function checkSyncConflict(): Promise<SyncConflictResult | null> {
  const remoteBackup = await fetchBackupFromGist();
  if (!remoteBackup) {
    // No remote backup exists, no conflict
    return null;
  }

  const remoteMeta = parseBackupMetadata(remoteBackup);
  if (!remoteMeta) {
    // Couldn't parse remote backup, treat as no conflict (will overwrite)
    return null;
  }

  const localVersion = getSyncVersion();
  const hasConflict = remoteMeta.syncVersion > localVersion;

  return {
    hasConflict,
    localVersion,
    remoteVersion: remoteMeta.syncVersion,
    remoteDeviceId: remoteMeta.deviceId,
    remoteExportedAt: remoteMeta.exportedAt,
  };
}

/**
 * Find an existing backup Gist for the user
 */
export async function findExistingBackupGist(
  token: string,
): Promise<string | null> {
  try {
    const response = await fetch(GITHUB_GIST_API, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!response.ok) return null;

    const gists = await response.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backupGist = gists.find(
      (gist: any) => gist.description === GIST_DESCRIPTION,
    );

    return backupGist ? backupGist.id : null;
  } catch {
    return null;
  }
}

/**
 * Get last backup timestamp
 */
export function getLastBackupTime(): string | null {
  return localStorage.getItem(STORAGE_KEYS.LAST_BACKUP);
}

/**
 * Save last backup timestamp
 */
function saveLastBackupTime(): void {
  localStorage.setItem(STORAGE_KEYS.LAST_BACKUP, new Date().toISOString());
}

/**
 * Get backup status
 */
export function getBackupStatus(): BackupStatus {
  const githubToken = getGithubToken();
  const gistId = getGistId();
  const lastBackup = getLastBackupTime();

  return {
    lastBackup,
    gistId,
    gistUrl: gistId ? `https://gist.github.com/${gistId}` : null,
    isConfigured: !!githubToken,
    syncVersion: getSyncVersion(),
    deviceId: getDeviceId(),
  };
}

/**
 * Create a new secret Gist with backup data
 */
async function createGist(token: string, backupData: string): Promise<string> {
  const response = await fetch(GITHUB_GIST_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false, // Secret gist
      files: {
        [BACKUP_FILENAME]: {
          content: backupData,
        },
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.message || `Failed to create Gist: ${response.status}`,
    );
  }

  const gist = await response.json();
  return gist.id;
}

/**
 * Update an existing Gist with new backup data
 */
async function updateGist(
  token: string,
  gistId: string,
  backupData: string,
): Promise<void> {
  const response = await fetch(`${GITHUB_GIST_API}/${gistId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      files: {
        [BACKUP_FILENAME]: {
          content: backupData,
        },
      },
    }),
  });

  if (!response.ok) {
    // If Gist not found (deleted), clear the stored ID
    if (response.status === 404) {
      localStorage.removeItem(STORAGE_KEYS.GIST_ID);
      throw new Error('Gist not found. Will create a new one on next backup.');
    }
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.message || `Failed to update Gist: ${response.status}`,
    );
  }
}

/**
 * Fetch backup data from Gist
 */
export async function fetchBackupFromGist(
  token?: string,
  gistId?: string,
): Promise<string | null> {
  const storedToken = token || getGithubToken();
  const storedGistId = gistId || getGistId();

  if (!storedToken || !storedGistId) {
    return null;
  }

  try {
    const response = await fetch(`${GITHUB_GIST_API}/${storedGistId}`, {
      headers: {
        Authorization: `Bearer ${storedToken}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch Gist:', response.status);
      return null;
    }

    const gist = await response.json();
    const file = gist.files?.[BACKUP_FILENAME];

    if (!file) {
      console.error('Backup file not found in Gist');
      return null;
    }

    return file.content;
  } catch (error) {
    console.error('Error fetching backup from Gist:', error);
    return null;
  }
}

/**
 * Validate GitHub token by making a test API call
 */
export async function validateGithubToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export interface AutoBackupResult {
  success: boolean;
  error?: string;
  gistUrl?: string;
  syncVersion?: number;
  conflict?: SyncConflictResult;
}

/**
 * Perform auto backup to GitHub Gist
 * Creates a new Gist if none exists, otherwise updates existing one
 * Includes sync version for cross-device conflict detection
 *
 * @param forceOverwrite - If true, skip conflict detection and overwrite remote
 */
export async function performAutoBackup(
  forceOverwrite = false,
): Promise<AutoBackupResult> {
  const token = getGithubToken();

  if (!token) {
    return { success: false, error: 'GitHub token not configured' };
  }

  try {
    let gistId = getGistId();

    // Check for sync conflicts if gist exists and not forcing overwrite
    if (gistId && !forceOverwrite) {
      const conflictResult = await checkSyncConflict();
      if (conflictResult?.hasConflict) {
        return {
          success: false,
          error: `Remote backup is newer (v${conflictResult.remoteVersion} vs local v${conflictResult.localVersion}). Sync or force overwrite required.`,
          conflict: conflictResult,
        };
      }
    }

    // Increment sync version and get metadata
    const newSyncVersion = incrementSyncVersion();
    const deviceId = getDeviceId();

    const syncMetadata: SyncMetadata = {
      syncVersion: newSyncVersion,
      deviceId,
    };

    // Export all data with sync metadata
    const backupData = await exportData(DEFAULT_EXPORT_OPTIONS, syncMetadata);

    if (gistId) {
      // Try to update existing Gist
      try {
        await updateGist(token, gistId, backupData);
      } catch (error) {
        // If update fails (Gist deleted), create new one
        if ((error as Error).message.includes('not found')) {
          gistId = await createGist(token, backupData);
          saveGistId(gistId);
        } else {
          throw error;
        }
      }
    } else {
      // Create new Gist
      gistId = await createGist(token, backupData);
      saveGistId(gistId);
    }

    saveLastBackupTime();

    return {
      success: true,
      gistUrl: `https://gist.github.com/${gistId}`,
      syncVersion: newSyncVersion,
    };
  } catch (error) {
    console.error('Auto backup failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Adopt the sync version from imported backup data.
 * Call this after successfully importing/restoring from a backup
 * to ensure local sync version matches the imported data.
 */
export function adoptSyncVersion(backupJson: string): void {
  const metadata = parseBackupMetadata(backupJson);
  if (metadata && metadata.syncVersion > 0) {
    saveSyncVersion(metadata.syncVersion);
    console.log(
      `Adopted sync version ${metadata.syncVersion} from imported backup`,
    );
  }
}

/**
 * Get the sync metadata from a backup JSON string.
 * Useful for displaying info about a backup before importing.
 */
export function getBackupSyncInfo(
  backupJson: string,
): RemoteBackupMetadata | null {
  return parseBackupMetadata(backupJson);
}

/**
 * Check if auto backup is configured and enabled
 */
export function isAutoBackupEnabled(): boolean {
  return !!getGithubToken();
}

/**
 * Debounce timer for auto-backup triggers
 */
let backupTimeout: ReturnType<typeof setTimeout> | null = null;
const BACKUP_DEBOUNCE_MS = 60000; // 1 minute debounce

/**
 * Trigger an auto-backup if enabled.
 * Uses debouncing to prevent excessive API calls.
 */
export function triggerAutoBackup(): void {
  if (!isAutoBackupEnabled()) return;

  if (backupTimeout) {
    clearTimeout(backupTimeout);
  }

  backupTimeout = setTimeout(async () => {
    console.log('Auto-backup triggered by change...');
    try {
      const result = await performAutoBackup();
      if (result.success) {
        console.log(
          `Auto-backup successful (v${result.syncVersion}):`,
          result.gistUrl,
        );
      } else if (result.conflict) {
        console.warn(
          `Auto-backup skipped: sync conflict detected. ` +
            `Remote v${result.conflict.remoteVersion} > local v${result.conflict.localVersion}. ` +
            `Import remote data or force backup to resolve.`,
        );
      } else {
        console.warn('Auto-backup failed:', result.error);
      }
    } catch (err) {
      console.error('Auto-backup error:', err);
    } finally {
      backupTimeout = null;
    }
  }, BACKUP_DEBOUNCE_MS);
}
