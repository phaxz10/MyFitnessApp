import { afterEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEYS = {
  GOOGLE_USER: 'mpf-google-user',
  ACCESS_TOKEN: 'mpf-access-token',
  TOKEN_EXPIRY: 'mpf-token-expiry',
} as const;

function createStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initial));

  return {
    get length() {
      return store.size;
    },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

function installGisMocks() {
  const initTokenClient = vi.fn(
    (config: google.accounts.oauth2.TokenClientConfig) => ({
      requestAccessToken: vi.fn(() => {
        config.error_callback?.({
          message: 'Popup blocked by browser',
          type: 'popup_failed_to_open',
        });
      }),
    }),
  );
  const scriptElement = {
    async: false,
    defer: false,
    id: '',
    onerror: undefined as (() => void) | undefined,
    onload: undefined as (() => void) | undefined,
    src: '',
  };
  const appendChild = vi.fn((script: typeof scriptElement) => {
    script.onload?.();
    return script;
  });

  vi.stubGlobal('document', {
    createElement: vi.fn(() => scriptElement),
    getElementById: vi.fn(() => null),
    head: { appendChild },
  });
  vi.stubGlobal('google', {
    accounts: {
      oauth2: {
        initTokenClient,
        revoke: vi.fn(),
      },
    },
  });

  return { appendChild, initTokenClient };
}

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('getAccessToken', () => {
  it('does not trigger the GIS popup flow for an expired stored token', async () => {
    vi.stubGlobal(
      'localStorage',
      createStorage({
        [STORAGE_KEYS.ACCESS_TOKEN]: 'expired-token',
        [STORAGE_KEYS.GOOGLE_USER]: JSON.stringify({
          email: 'test@example.com',
          name: 'Test User',
          picture: '',
        }),
        [STORAGE_KEYS.TOKEN_EXPIRY]: String(Date.now() - 1_000),
      }),
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const { appendChild, initTokenClient } = installGisMocks();

    const { getAccessToken } = await import('./googleAuth');

    await expect(getAccessToken()).resolves.toBeNull();
    expect(appendChild).not.toHaveBeenCalled();
    expect(initTokenClient).not.toHaveBeenCalled();
  });
});
