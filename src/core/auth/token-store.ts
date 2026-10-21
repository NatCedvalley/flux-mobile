import type { Account } from '../api';

/**
 * What survives an app restart. The account is the last `/accounts/me`
 * seen, so a cold start offline still knows who is signed in; it is fetched
 * again whenever the backend can be reached.
 */
export type StoredSession = {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. */
  accessTokenExpiresAt: number;
  account?: Account;
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

/** The stored account, if it looks like one (older versions stored none). */
export function storedAccount(session: StoredSession): Account | null {
  const account: unknown = session.account;
  return typeof account === 'object' &&
    account !== null &&
    typeof (account as Account).id === 'string'
    ? (account as Account)
    : null;
}
