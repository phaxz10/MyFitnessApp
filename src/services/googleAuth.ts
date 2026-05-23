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

export interface GoogleAuthStatus {
  user: GoogleUser | null;
  hasValidAccessToken: boolean;
  needsReconnect: boolean;
}

let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let currentAccessToken: string | null = localStorage.getItem(
  STORAGE_KEYS.ACCESS_TOKEN,
);

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
  const expiryMs = Number(expiry);
  return !Number.isFinite(expiryMs) || Date.now() >= expiryMs;
}

export function hasValidGoogleAccessToken(): boolean {
  return !!currentAccessToken && !isTokenExpired();
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

function requestToken(prompt?: 'consent' | 'none'): Promise<string> {
  return new Promise((resolve, reject) => {
    const config: google.accounts.oauth2.TokenClientConfig = {
      client_id: CLIENT_ID,
      scope: SCOPES,
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
    };
    if (prompt !== undefined) config.prompt = prompt;

    tokenClient = google.accounts.oauth2.initTokenClient(config);
    tokenClient.requestAccessToken();
  });
}

// Attempts a silent token refresh. Succeeds only if the user still has an
// active Google session — no popup, no consent screen. Falls back to false on
// any failure so callers can surface a Reconnect prompt.
export async function attemptSilentTokenRefresh(): Promise<boolean> {
  if (!isSignedIn()) return false;
  if (hasValidGoogleAccessToken()) return true;
  try {
    await loadGisScript();
    await requestToken('none');
    return hasValidGoogleAccessToken();
  } catch {
    return false;
  }
}

export async function signIn(): Promise<{ token: string; user: GoogleUser }> {
  await loadGisScript();
  const token = await requestToken('consent');
  const user = await fetchUserInfo(token);
  localStorage.setItem(STORAGE_KEYS.GOOGLE_USER, JSON.stringify(user));
  return { token, user };
}

export async function requestGoogleAccessToken(): Promise<string> {
  if (hasValidGoogleAccessToken() && currentAccessToken) {
    return currentAccessToken;
  }

  // Try silent first — if the user's Google session is still valid, this
  // refreshes the token without any UI.
  if ((await attemptSilentTokenRefresh()) && currentAccessToken) {
    return currentAccessToken;
  }

  // Fall back to interactive. If a user is already stored, verify the new
  // token belongs to the same account — otherwise we'd silently start writing
  // account A's data to account B's Drive.
  const storedUser = getStoredUser();
  clearPersistedToken();
  await loadGisScript();
  const token = await requestToken();

  if (storedUser) {
    const newUser = await fetchUserInfo(token);
    if (newUser.email !== storedUser.email) {
      revokeAccessToken();
      throw new Error(
        `Signed in as ${newUser.email}, but the connected account is ${storedUser.email}. Disconnect Drive first to switch accounts.`,
      );
    }
  }

  return token;
}

export async function getAccessToken(): Promise<string | null> {
  if (hasValidGoogleAccessToken() && currentAccessToken) {
    return currentAccessToken;
  }
  if (currentAccessToken) {
    clearPersistedToken();
  }
  return null;
}

function revokeAccessToken(): void {
  if (currentAccessToken) {
    google.accounts.oauth2.revoke(currentAccessToken, () => {});
  }
  clearPersistedToken();
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

export function getGoogleAuthStatus(): GoogleAuthStatus {
  const user = getStoredUser();
  const hasValidAccessToken = hasValidGoogleAccessToken();

  return {
    user,
    hasValidAccessToken,
    needsReconnect: !!user && !hasValidAccessToken,
  };
}

export function isSignedIn(): boolean {
  return !!getStoredUser();
}

export function signOut(): void {
  revokeAccessToken();
  tokenClient = null;
  localStorage.removeItem(STORAGE_KEYS.GOOGLE_USER);
}
