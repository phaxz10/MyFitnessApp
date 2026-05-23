declare namespace google.accounts.oauth2 {
  interface TokenClient {
    requestAccessToken(): void;
  }

  interface TokenResponse {
    access_token: string;
    error?: string;
    expires_in: number;
    scope: string;
    token_type: string;
  }

  interface TokenClientConfig {
    client_id: string;
    scope: string;
    prompt?: 'consent' | 'none' | '';
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type: string; message?: string }) => void;
  }

  function initTokenClient(config: TokenClientConfig): TokenClient;
  function revoke(token: string, callback: () => void): void;
}
