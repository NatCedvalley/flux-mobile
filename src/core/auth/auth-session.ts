import type { Account, AuthTokens } from '../api';
import type { AuthClient } from './auth-client';
import {
  ApiError,
  SESSION_EXPIRED_MESSAGE,
  endsSession,
  isTransient,
  isUnauthorizedWithoutCode,
} from './api-error';
import {
  isStoredSession,
  type StoredSession,
  type TokenStore,
} from './token-store';

export type AuthState = {
  isSignedIn: boolean;
  /** Null until `/accounts/me` loads, or while the backend is unreachable. */
  account: Account | null;
  /**
   * Why the last session ended, for the login page. Null after a logout,
   * and cleared by the next sign-in.
   */
  endedMessage: string | null;
};

/**
 * Treat a token this close to expiry as expired, so it can't lapse in
 * flight. Also how early the proactive refresh fires.
 */
const EXPIRY_SKEW_MS = 30_000;

/** Refresh retries on a transient failure: full jitter, 2 s base, 30 s cap. */
const REFRESH_RETRIES = 3;
const REFRESH_BACKOFF_BASE_MS = 2_000;
const REFRESH_BACKOFF_CAP_MS = 30_000;

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
  private endedMessage: string | null = null;
  private readonly listeners = new Set<(state: AuthState) => void>();
  /** The refresh in flight, shared by every caller that needs one. */
  private refreshing: Promise<void> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly client: AuthClient,
    private readonly store: TokenStore,
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly random: () => number = Math.random
  ) {}

  get state(): AuthState {
    return {
      isSignedIn: this.session !== null,
      account: this.account,
      endedMessage: this.endedMessage,
    };
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
    if (this.expiresSoon()) {
      try {
        // One attempt only: backing off would hold the first screen.
        await this.refresh(false);
      } catch {
        // A rejected refresh has already ended the session. Offline keeps it.
        if (this.session) {
          this.emit();
        }
        return;
      }
    } else {
      this.scheduleRefresh();
    }
    await this.loadAccount();
  }

  /**
   * Call when the app returns to the foreground: timers don't run while it
   * is suspended, so the proactive refresh may be overdue. Never rejects.
   */
  async resume(): Promise<void> {
    if (!this.session) {
      return;
    }
    if (this.expiresSoon()) {
      await this.refresh(true).catch(() => undefined);
    } else {
      this.scheduleRefresh();
    }
  }

  /**
   * Runs `call` with a live access token; every authenticated backend call
   * goes through here. Refreshes first if the token is about to expire, and
   * on a bare 401 refreshes and retries once. Ends the session when the
   * server says it is gone. Always rejects with the call's own error, and a
   * transient failure (offline, 5xx) leaves the tokens alone.
   */
  async withAccessToken<T>(
    call: (accessToken: string) => Promise<T>
  ): Promise<T> {
    if (this.expiresSoon()) {
      await this.refresh(true);
    }
    const token = this.accessToken();
    try {
      return await call(token);
    } catch (error) {
      if (!isUnauthorizedWithoutCode(error)) {
        await this.endIfDead(error);
        throw error;
      }
    }

    // A concurrent caller may have refreshed while this call was in flight.
    if (this.session?.accessToken === token) {
      await this.refresh(true);
    }
    try {
      return await call(this.accessToken());
    } catch (error) {
      if (isUnauthorizedWithoutCode(error)) {
        await this.end(SESSION_EXPIRED_MESSAGE);
      } else {
        await this.endIfDead(error);
      }
      throw error;
    }
  }

  /**
   * Ends the session on the server, then forgets it locally. The local
   * clear happens even when the server call fails or can't be made.
   */
  async logout(): Promise<void> {
    if (!this.session) {
      return;
    }
    try {
      // The server only accepts a live access token.
      if (this.expiresSoon()) {
        await this.refresh(false);
      }
      const current = this.session;
      if (current) {
        await this.client.logout(current.accessToken, current.refreshToken);
      }
    } catch {
      // Offline, or the session was already gone: nothing left to end.
    } finally {
      this.endedMessage = null;
      await this.discard();
    }
  }

  private async loadAccount(): Promise<void> {
    if (!this.session) {
      return;
    }
    try {
      this.account = await this.withAccessToken((token) =>
        this.client.getMe(token)
      );
    } catch (error) {
      if (!this.session) {
        return; // withAccessToken ended it.
      }
      if (!isTransient(error)) {
        await this.discard();
        return;
      }
    }
    this.emit();
  }

  /** Refreshes the tokens, sharing one call among concurrent callers. */
  private refresh(backoff: boolean): Promise<void> {
    this.refreshing ??= this.refreshTokens(backoff).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /**
   * Transient failures keep the tokens and, with `backoff`, are retried.
   * Anything else (the backend maps every Keycloak 4xx to 401
   * `SESSION_EXPIRED`) ends the session. Rejects when no refresh happened.
   */
  private async refreshTokens(backoff: boolean): Promise<void> {
    const refreshToken = this.session?.refreshToken;
    if (!refreshToken) {
      throw new ApiError(401);
    }
    for (let retry = 1; ; retry++) {
      try {
        const tokens = await this.client.refresh(refreshToken);
        // Skip if the session ended or was replaced while this was in flight.
        if (this.session?.refreshToken === refreshToken) {
          await this.adopt(tokens);
        }
        return;
      } catch (error) {
        if (!isTransient(error)) {
          if (this.session?.refreshToken === refreshToken) {
            await this.end(messageOf(error));
          }
          throw error;
        }
        if (!backoff || retry > REFRESH_RETRIES) {
          throw error;
        }
        const cap = Math.min(
          REFRESH_BACKOFF_CAP_MS,
          REFRESH_BACKOFF_BASE_MS * 2 ** (retry - 1)
        );
        await this.sleep(Math.floor(this.random() * cap));
      }
    }
  }

  private scheduleRefresh(): void {
    clearTimeout(this.refreshTimer);
    if (!this.session) {
      return;
    }
    const delay =
      this.session.accessTokenExpiresAt - EXPIRY_SKEW_MS - this.now();
    this.refreshTimer = setTimeout(
      // A failure has already been handled: ended, or kept while offline.
      () => void this.refresh(true).catch(() => undefined),
      Math.max(delay, 0)
    );
  }

  private expiresSoon(): boolean {
    return (
      this.session !== null &&
      this.session.accessTokenExpiresAt - EXPIRY_SKEW_MS <= this.now()
    );
  }

  /** Rejects when signed out, so a late call never leaves the device. */
  private accessToken(): string {
    if (!this.session) {
      throw new ApiError(401);
    }
    return this.session.accessToken;
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
    this.endedMessage = null;
    await this.store.save(this.session);
    this.scheduleRefresh();
  }

  private async endIfDead(error: unknown): Promise<void> {
    if (endsSession(error)) {
      await this.end(messageOf(error));
    }
  }

  /** Drops a session the server has rejected, keeping the reason. */
  private async end(message: string): Promise<void> {
    if (!this.session) {
      return;
    }
    this.endedMessage = message;
    await this.discard();
  }

  /** Forgets the session locally. */
  private async discard(): Promise<void> {
    clearTimeout(this.refreshTimer);
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

/** The server's own explanation, else the generic one. */
function messageOf(error: unknown): string {
  return (
    (error instanceof ApiError ? error.body.message : undefined) ??
    SESSION_EXPIRED_MESSAGE
  );
}
