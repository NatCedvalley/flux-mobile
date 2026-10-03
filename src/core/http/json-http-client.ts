import { ApiError, type ErrorResponse } from '../auth/api-error';

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** Query-string values. `undefined` ones are left out. */
export type QueryParams = Record<string, boolean | number | string | undefined>;

/**
 * Native `fetch` (CapacitorHttp) ignores `AbortSignal`, so an unreachable
 * backend is cut off with a race instead of hanging the first screen.
 */
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * JSON over `fetch` for one backend, shared by `AuthClient` (flux-iam) and
 * `HttpFluxApi` (flux-operations). `baseUrl` ends in `/api/v1`, and paths are
 * relative to it.
 *
 * Any fetch failure or timeout is an `ApiError` with status 0, and a non-OK
 * response is an `ApiError` carrying the status and the backend's
 * `ErrorResponse`.
 */
export class JsonHttpClient {
  constructor(
    private readonly baseUrl: string,
    // Wrapped rather than defaulting to `fetch` itself: calling the browser's
    // fetch as a method of another object throws "Illegal invocation".
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init),
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS
  ) {}

  async request<T>(
    method: 'GET' | 'POST',
    path: string,
    options: { accessToken?: string; body?: unknown; query?: QueryParams } = {}
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
        this.fetchFn(`${this.baseUrl}${path}${queryString(options.query)}`, {
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

/** `?a=1&b=x`, or '' when no value is defined. */
function queryString(query: QueryParams | undefined): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      params.append(key, String(value));
    }
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
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
