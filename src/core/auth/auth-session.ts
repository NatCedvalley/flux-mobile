import type { Account, AuthTokens } from '../api';
import type { AuthClient } from './auth-client';
import { isTransient } from './api-error';
import {
  isStoredSession,
  type StoredSession,
  type TokenStore,
} from './token-store';

export type AuthState = {
  isSignedIn: boolean;
  /** Null until `/accounts/me` loads, or while the backend is unreachable. */
  account: Account | null;
};

/** Treat a token this close to expiry as expired, so it can't lapse in flight. */
const EXPIRY_SKEW_MS = 30_000;

/**
 * The signed-in session: tokens (persisted through a `TokenStore`) plus the
 * current account. Framework-agnostic; src/app wraps it in signals.
 *
 * A session is only dropped when the server rejects it. When the backend is
 * unreachable the stored tokens are kept, so being offline never signs
 * anyone out.
 */
export class AuthSession {
  private session: StoredSession | null = null;
  private account: Account | null = null;
  private readonly listeners = new Set<(state: AuthState) => void>();

  constructor(
    private readonly client: AuthClient,
    private readonly store: TokenStore,
    private readonly now: () => number = () => Date.now()
  ) {}

  get state(): AuthState {
    return { isSignedIn: this.session !== null, account: this.account };
  }

  /** Calls `listener` after every state change. Returns an unsubscribe. */
  onChange(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Signs in and persists the tokens. Rejects with `ApiError` on failure. */
  async login(email: string, password: string): Promise<void> {
    await this.adopt(await this.client.login(email, password));
    await this.loadAccount();
  }

  /**
   * Restores the stored session on a cold start: refreshes the access token
   * if it has expired, then loads the account.
   */
  async restore(): Promise<void> {
    let stored: unknown = null;
    try {
      stored = await this.store.load();
    } catch {
      // E.g. a blob restored from a backup on another device, whose
      // Keystore key did not come with it. Treated as signed out.
    }
    if (!isStoredSession(stored)) {
      await this.discard();
      return;
    }

    this.session = stored;
    if (stored.accessTokenExpiresAt - EXPIRY_SKEW_MS <= this.now()) {
      try {
        await this.adopt(await this.client.refresh(stored.refreshToken));
      } catch (error) {
        if (isTransient(error)) {
          this.emit();
        } else {
          await this.discard();
        }
        return;
      }
    }
    await this.loadAccount();
  }

  private async loadAccount(): Promise<void> {
    if (!this.session) {
      return;
    }
    try {
      this.account = await this.client.getMe(this.session.accessToken);
    } catch (error) {
      if (!isTransient(error)) {
        await this.discard();
        return;
      }
    }
    this.emit();
  }

  private async adopt(tokens: AuthTokens): Promise<void> {
    const { accessToken, refreshToken, expiresIn } = tokens;
    // Generated DTO fields are all optional; the backend always sends these.
    if (!accessToken || !refreshToken || expiresIn === undefined) {
      throw new Error('Auth response is missing tokens');
    }
    this.session = {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: this.now() + expiresIn * 1000,
    };
    await this.store.save(this.session);
  }

  /** Forgets the session locally. Server-side logout is FM-24. */
  private async discard(): Promise<void> {
    this.session = null;
    this.account = null;
    await this.store.clear();
    this.emit();
  }

  private emit(): void {
    const state = this.state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
