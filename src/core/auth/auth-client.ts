import type {
  Account,
  AuthTokens,
  LoginRequest,
  RefreshTokenRequest,
} from '../api';
import { ApiError, type ErrorResponse } from './api-error';

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Native `fetch` (CapacitorHttp) ignores `AbortSignal`, so an unreachable
 * backend is cut off with a race instead of hanging the first screen.
 */
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * The flux-iam endpoints sign-in needs. `baseUrl` is the environment's
 * `iamBaseUrl` (ending in `/api/v1`).
 */
export class AuthClient {
  constructor(
    private readonly baseUrl: string,
    // Wrapped rather than defaulting to `fetch` itself: calling the browser's
    // fetch as a method of another object throws "Illegal invocation".
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init),
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS
  ) {}

  /** POST /auth/login. Mobile always asks for a long-lived offline session. */
  login(email: string, password: string): Promise<AuthTokens> {
    const body: LoginRequest = { email, password, rememberMe: true };
    return this.request('POST', '/auth/login', { body });
  }

  /** POST /auth/refresh */
  refresh(refreshToken: string): Promise<AuthTokens> {
    const body: RefreshTokenRequest = { refreshToken };
    return this.request('POST', '/auth/refresh', { body });
  }

  /**
   * POST /auth/logout. Needs a live access token: the server revokes it, then
   * ends the Keycloak session the refresh token belongs to.
   */
  async logout(accessToken: string, refreshToken: string): Promise<void> {
    const body: RefreshTokenRequest = { refreshToken };
    await this.request('POST', '/auth/logout', { body, accessToken });
  }

  /** GET /accounts/me */
  getMe(accessToken: string): Promise<Account> {
    return this.request('GET', '/accounts/me', { accessToken });
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    options: { body?: unknown; accessToken?: string }
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (options.accessToken) {
      headers['Authorization'] = `Bearer ${options.accessToken}`;
    }

    let response: Response;
    try {
      response = await this.withTimeout(
        this.fetchFn(`${this.baseUrl}${path}`, {
          method,
          headers,
          body:
            options.body === undefined
              ? undefined
              : JSON.stringify(options.body),
        })
      );
    } catch {
      throw new ApiError(0);
    }

    const payload = await readJson(response);
    if (!response.ok) {
      const body =
        typeof payload === 'object' && payload !== null
          ? (payload as ErrorResponse)
          : {};
      throw new ApiError(response.status, body);
    }
    return payload as T;
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Request timed out')),
        this.timeoutMs
      );
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }
}

/** The parsed JSON body, or null when it is empty or not JSON. */
async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}
