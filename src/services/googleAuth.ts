const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const SCOPES = 'https://www.googleapis.com/auth/drive.file email profile';

const STORAGE_KEYS = {
  GOOGLE_USER: 'mpf-google-user',
  ACCESS_TOKEN: 'mpf-access-token',
  TOKEN_EXPIRY: 'mpf-token-expiry',
} as const;

export interface GoogleUser {
  email: string;
  name: string;
  picture: string;
}

let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let currentAccessToken: string | null = localStorage.getItem(
  STORAGE_KEYS.ACCESS_TOKEN,
);
let silentReauthFailed = false;

function persistToken(token: string, expiresIn: number): void {
  currentAccessToken = token;
  const expiry = Date.now() + expiresIn * 1000;
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
  localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, String(expiry));
}

function clearPersistedToken(): void {
  currentAccessToken = null;
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY);
}

function isTokenExpired(): boolean {
  const expiry = localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY);
  if (!expiry) return true;
  return Date.now() >= Number(expiry);
}

function loadGisScript(): Promise<void> {
  if (document.getElementById('gis-script')) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'gis-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

function initTokenClient(prompt: 'consent' | 'none'): Promise<string> {
  return new Promise((resolve, reject) => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      prompt,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        persistToken(
          response.access_token,
          Number(response.expires_in) || 3600,
        );
        resolve(response.access_token);
      },
      error_callback: (err) => {
        reject(new Error(err.message || 'Token request failed'));
      },
    });
    tokenClient.requestAccessToken();
  });
}

export async function signIn(): Promise<{ token: string; user: GoogleUser }> {
  await loadGisScript();
  silentReauthFailed = false;
  const token = await initTokenClient('consent');
  const user = await fetchUserInfo(token);
  localStorage.setItem(STORAGE_KEYS.GOOGLE_USER, JSON.stringify(user));
  return { token, user };
}

export async function silentReauth(): Promise<string | null> {
  if (silentReauthFailed) return null;

  const stored = localStorage.getItem(STORAGE_KEYS.GOOGLE_USER);
  if (!stored) return null;

  try {
    await loadGisScript();
    const token = await initTokenClient('none');
    return token;
  } catch {
    silentReauthFailed = true;
    return null;
  }
}

export async function getAccessToken(): Promise<string | null> {
  if (currentAccessToken && !isTokenExpired()) {
    return currentAccessToken;
  }
  if (currentAccessToken) {
    const valid = await validateToken(currentAccessToken);
    if (valid) return currentAccessToken;
    clearPersistedToken();
  }
  return silentReauth();
}

async function validateToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`,
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchUserInfo(token: string): Promise<GoogleUser> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch user info');
  const data = await res.json();
  return { email: data.email, name: data.name, picture: data.picture };
}

export function getStoredUser(): GoogleUser | null {
  const stored = localStorage.getItem(STORAGE_KEYS.GOOGLE_USER);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function isSignedIn(): boolean {
  return !!localStorage.getItem(STORAGE_KEYS.GOOGLE_USER);
}

export function signOut(): void {
  if (currentAccessToken) {
    google.accounts.oauth2.revoke(currentAccessToken, () => {});
  }
  clearPersistedToken();
  tokenClient = null;
  localStorage.removeItem(STORAGE_KEYS.GOOGLE_USER);
}
