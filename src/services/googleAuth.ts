const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const SCOPES = 'https://www.googleapis.com/auth/drive.file email profile';

const STORAGE_KEYS = {
  GOOGLE_USER: 'mpf-google-user',
} as const;

export interface GoogleUser {
  email: string;
  name: string;
  picture: string;
}

let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let currentAccessToken: string | null = null;

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
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
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
        currentAccessToken = response.access_token;
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
  const token = await initTokenClient('consent');
  const user = await fetchUserInfo(token);
  localStorage.setItem(STORAGE_KEYS.GOOGLE_USER, JSON.stringify(user));
  return { token, user };
}

export async function silentReauth(): Promise<string | null> {
  const stored = localStorage.getItem(STORAGE_KEYS.GOOGLE_USER);
  if (!stored) return null;

  try {
    await loadGisScript();
    const token = await initTokenClient('none');
    return token;
  } catch {
    return null;
  }
}

export async function getAccessToken(): Promise<string | null> {
  if (currentAccessToken) {
    const valid = await validateToken(currentAccessToken);
    if (valid) return currentAccessToken;
  }
  return silentReauth();
}

async function validateToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`);
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
    currentAccessToken = null;
  }
  tokenClient = null;
  localStorage.removeItem(STORAGE_KEYS.GOOGLE_USER);
}
