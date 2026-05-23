import { getAccessToken } from './googleAuth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const APP_FOLDER_NAME = 'MyFitnessApp';
const PHOTOS_FOLDER_NAME = 'photos';
const BACKUP_FILENAME = 'backup.json';

const STORAGE_KEYS = {
  APP_FOLDER_ID: 'mpf-drive-folder-id',
  PHOTOS_FOLDER_ID: 'mpf-drive-photos-folder-id',
  LAST_BACKUP: 'mpf-last-backup',
  LAST_RESTORED: 'mpf-last-restored-at',
} as const;

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google');
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// Folder management
// ---------------------------------------------------------------------------

async function findFolder(name: string, parentId?: string): Promise<string | null> {
  const headers = await authHeaders();
  let q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;

  const res = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`, { headers });
  if (!res.ok) return null;
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

async function createFolder(name: string, parentId?: string): Promise<string> {
  const headers = await authHeaders();
  const metadata: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) metadata.parents = [parentId];

  const res = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  });
  if (!res.ok) throw new Error(`Failed to create folder: ${res.status}`);
  const data = await res.json();
  return data.id;
}

async function ensureAppFolder(): Promise<string> {
  let folderId = localStorage.getItem(STORAGE_KEYS.APP_FOLDER_ID);
  if (folderId) {
    const headers = await authHeaders();
    const check = await fetch(`${DRIVE_API}/files/${folderId}?fields=id,trashed`, { headers });
    if (check.ok) {
      const info = await check.json();
      if (!info.trashed) return folderId;
    }
  }

  folderId = await findFolder(APP_FOLDER_NAME);
  if (!folderId) folderId = await createFolder(APP_FOLDER_NAME);
  localStorage.setItem(STORAGE_KEYS.APP_FOLDER_ID, folderId);
  return folderId;
}

async function ensurePhotosFolder(): Promise<string> {
  let folderId = localStorage.getItem(STORAGE_KEYS.PHOTOS_FOLDER_ID);
  if (folderId) {
    const headers = await authHeaders();
    const check = await fetch(`${DRIVE_API}/files/${folderId}?fields=id,trashed`, { headers });
    if (check.ok) {
      const info = await check.json();
      if (!info.trashed) return folderId;
    }
  }

  const appFolderId = await ensureAppFolder();
  folderId = await findFolder(PHOTOS_FOLDER_NAME, appFolderId);
  if (!folderId) folderId = await createFolder(PHOTOS_FOLDER_NAME, appFolderId);
  localStorage.setItem(STORAGE_KEYS.PHOTOS_FOLDER_ID, folderId);
  return folderId;
}

// ---------------------------------------------------------------------------
// Backup JSON (structured data)
// ---------------------------------------------------------------------------

async function findBackupFile(appFolderId: string): Promise<string | null> {
  const headers = await authHeaders();
  const q = `name='${BACKUP_FILENAME}' and '${appFolderId}' in parents and trashed=false`;
  const res = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`, { headers });
  if (!res.ok) return null;
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

export async function uploadBackupJson(jsonString: string): Promise<void> {
  const appFolderId = await ensureAppFolder();
  const headers = await authHeaders();
  const existingId = await findBackupFile(appFolderId);

  if (existingId) {
    const res = await fetch(`${UPLOAD_API}/files/${existingId}?uploadType=media`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: jsonString,
    });
    if (!res.ok) throw new Error(`Failed to update backup: ${res.status}`);
  } else {
    const metadata = { name: BACKUP_FILENAME, parents: [appFolderId] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([jsonString], { type: 'application/json' }));

    const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart`, {
      method: 'POST',
      headers: { Authorization: (headers as Record<string, string>).Authorization },
      body: form,
    });
    if (!res.ok) throw new Error(`Failed to create backup: ${res.status}`);
  }

  localStorage.setItem(STORAGE_KEYS.LAST_BACKUP, new Date().toISOString());
}

export async function downloadBackupJson(): Promise<string | null> {
  try {
    const appFolderId = await ensureAppFolder();
    const fileId = await findBackupFile(appFolderId);
    if (!fileId) return null;

    const headers = await authHeaders();
    const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, { headers });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

export async function getRemoteExportedAt(): Promise<string | null> {
  const json = await downloadBackupJson();
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return parsed.exported_at ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Photo management
// ---------------------------------------------------------------------------

export async function listRemotePhotos(): Promise<string[]> {
  const photosFolderId = await ensurePhotosFolder();
  const headers = await authHeaders();
  const q = `'${photosFolderId}' in parents and trashed=false`;
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(name)&pageSize=1000&spaces=drive${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, { headers });
    if (!res.ok) break;
    const data = await res.json();
    for (const file of data.files ?? []) {
      const match = (file.name as string).match(/^photo-(\d+)\.jpg$/);
      if (match) ids.push(match[1]);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return ids;
}

export async function uploadPhoto(photoId: number, dataUrl: string): Promise<void> {
  const photosFolderId = await ensurePhotosFolder();
  const headers = await authHeaders();

  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'image/jpeg' });

  const metadata = { name: `photo-${photoId}.jpg`, parents: [photosFolderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart`, {
    method: 'POST',
    headers: { Authorization: (headers as Record<string, string>).Authorization },
    body: form,
  });
  if (!res.ok) throw new Error(`Failed to upload photo-${photoId}: ${res.status}`);
}

export async function downloadPhoto(photoId: number): Promise<string | null> {
  const photosFolderId = await ensurePhotosFolder();
  const headers = await authHeaders();
  const q = `name='photo-${photoId}.jpg' and '${photosFolderId}' in parents and trashed=false`;

  const listRes = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`, { headers });
  if (!listRes.ok) return null;
  const listData = await listRes.json();
  const fileId = listData.files?.[0]?.id;
  if (!fileId) return null;

  const dlRes = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, { headers });
  if (!dlRes.ok) return null;

  const arrayBuffer = await dlRes.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binaryStr = '';
  for (let i = 0; i < bytes.length; i++) binaryStr += String.fromCharCode(bytes[i]);
  return `data:image/jpeg;base64,${btoa(binaryStr)}`;
}

// ---------------------------------------------------------------------------
// Backup status helpers
// ---------------------------------------------------------------------------

export function getLastBackupTime(): string | null {
  return localStorage.getItem(STORAGE_KEYS.LAST_BACKUP);
}

export function getLastRestoredAt(): string | null {
  return localStorage.getItem(STORAGE_KEYS.LAST_RESTORED);
}

export function setLastRestoredAt(ts: string): void {
  localStorage.setItem(STORAGE_KEYS.LAST_RESTORED, ts);
}

export function clearDriveState(): void {
  localStorage.removeItem(STORAGE_KEYS.APP_FOLDER_ID);
  localStorage.removeItem(STORAGE_KEYS.PHOTOS_FOLDER_ID);
  localStorage.removeItem(STORAGE_KEYS.LAST_BACKUP);
  localStorage.removeItem(STORAGE_KEYS.LAST_RESTORED);
}

export async function hasRemoteBackup(): Promise<boolean> {
  try {
    const appFolderId = await ensureAppFolder();
    const fileId = await findBackupFile(appFolderId);
    return !!fileId;
  } catch {
    return false;
  }
}
