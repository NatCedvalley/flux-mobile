import type {
  Account,
  AuthTokens,
  LoginRequest,
  RefreshTokenRequest,
} from '../api';
import { type FetchFn, JsonHttpClient } from '../http';

export type { FetchFn } from '../http';

/**
 * The flux-iam endpoints sign-in needs. `baseUrl` is the environment's
 * `iamBaseUrl` (ending in `/api/v1`).
 */
export class AuthClient {
  private readonly http: JsonHttpClient;

  constructor(baseUrl: string, fetchFn?: FetchFn, timeoutMs?: number) {
    this.http = new JsonHttpClient(baseUrl, fetchFn, timeoutMs);
  }

  /** POST /auth/login. Mobile always asks for a long-lived offline session. */
  login(email: string, password: string): Promise<AuthTokens> {
    const body: LoginRequest = { email, password, rememberMe: true };
    return this.http.request('POST', '/auth/login', { body });
  }

  /** POST /auth/refresh */
  refresh(refreshToken: string): Promise<AuthTokens> {
    const body: RefreshTokenRequest = { refreshToken };
    return this.http.request('POST', '/auth/refresh', { body });
  }

  /**
   * POST /auth/logout. Needs a live access token: the server revokes it, then
   * ends the Keycloak session the refresh token belongs to.
   */
  async logout(accessToken: string, refreshToken: string): Promise<void> {
    const body: RefreshTokenRequest = { refreshToken };
    await this.http.request('POST', '/auth/logout', { body, accessToken });
  }

  /** GET /accounts/me */
  getMe(accessToken: string): Promise<Account> {
    return this.http.request('GET', '/accounts/me', { accessToken });
  }
}
