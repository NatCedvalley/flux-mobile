/**
 * What survives an app restart. The account is not stored; it is re-fetched
 * from `/accounts/me` on every cold start.
 */
export type StoredSession = {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. */
  accessTokenExpiresAt: number;
};

/**
 * Where the session is persisted. Native builds get a Keychain/Keystore-backed
 * implementation from src/app (the `TOKEN_STORE` injection token); web and
 * tests use `MemoryTokenStore`.
 */
export type TokenStore = {
  load(): Promise<unknown>;
  save(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
};

/**
 * Keeps the session in memory only, so it is gone on reload. Used on web,
 * which has no secure storage and must never put tokens in localStorage.
 */
export class MemoryTokenStore implements TokenStore {
  private session: StoredSession | null = null;

  async load(): Promise<StoredSession | null> {
    return this.session;
  }

  async save(session: StoredSession): Promise<void> {
    this.session = session;
  }

  async clear(): Promise<void> {
    this.session = null;
  }
}

/** Guards against whatever a store hands back from a previous app version. */
export function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const session = value as Record<string, unknown>;
  return (
    typeof session['accessToken'] === 'string' &&
    typeof session['refreshToken'] === 'string' &&
    typeof session['accessTokenExpiresAt'] === 'number'
  );
}
