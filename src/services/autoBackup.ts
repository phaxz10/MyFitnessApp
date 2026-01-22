import { DEFAULT_EXPORT_OPTIONS, exportData } from './backup';

const GITHUB_GIST_API = 'https://api.github.com/gists';
const BACKUP_FILENAME = 'mypersonalfitness-backup.json';
const GIST_DESCRIPTION = 'MyPersonalFitness Auto Backup';

// Storage keys
const STORAGE_KEYS = {
  GITHUB_TOKEN: 'mpf-github-token',
  GIST_ID: 'mpf-gist-id',
  LAST_BACKUP: 'mpf-last-backup',
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

/**
 * Perform auto backup to GitHub Gist
 * Creates a new Gist if none exists, otherwise updates existing one
 */
export async function performAutoBackup(): Promise<{
  success: boolean;
  error?: string;
  gistUrl?: string;
}> {
  const token = getGithubToken();

  if (!token) {
    return { success: false, error: 'GitHub token not configured' };
  }

  try {
    // Export all data
    const backupData = await exportData(DEFAULT_EXPORT_OPTIONS);

    let gistId = getGistId();

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
 * Check if auto backup is configured and enabled
 */
export function isAutoBackupEnabled(): boolean {
  return !!getGithubToken();
}

/**
 * Debounce timer for auto-backup triggers
 */
let backupTimeout: NodeJS.Timeout | null = null;
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
        console.log('Auto-backup successful:', result.gistUrl);
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
