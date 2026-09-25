/**
 * The error body every Flux backend service writes (flux-core's
 * `ErrorResponse`). Hand-written because it is not in the generated types:
 * the shared exception handler and security filters write it directly, so
 * springdoc never registers the schema.
 */
export type ErrorResponse = {
  code?: string;
  message?: string;
  detail?: string;
  timestamp?: string;
  path?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * A failed backend call. `status` is 0 when no response arrived at all
 * (offline, DNS failure, timeout). `body` is the server's `ErrorResponse`, or
 * empty when the response had no JSON body (e.g. Spring's bare 401).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ErrorResponse = {}
  ) {
    super(
      body.message ??
        (status === 0 ? 'Network request failed' : `HTTP ${status}`)
    );
    this.name = 'ApiError';
  }
}

/** Shown on the login page when the server gave no message of its own. */
export const SESSION_EXPIRED_MESSAGE =
  'Your session has expired. Please sign in again.';

/**
 * True for failures worth retrying later (no response, or a 5xx such as
 * `KEYCLOAK_UNAVAILABLE`), as opposed to the server rejecting the request.
 */
export function isTransient(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.status === 0 || error.status >= 500)
  );
}

/**
 * True for Spring's bare 401 (an expired or invalid JWT), which is worth one
 * refresh. A 401 with a code is the backend saying why, and is final.
 */
export function isUnauthorizedWithoutCode(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401 && !error.body.code;
}

/**
 * True when the server says the session itself is gone: revoked, expired,
 * or the account suspended or locked. Any other 403 is a permission error
 * on one request and leaves the session alone.
 */
export function endsSession(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return false;
  }
  const { status, body } = error;
  return (
    (status === 401 &&
      (body.code === 'TOKEN_REVOKED' || body.code === 'SESSION_EXPIRED')) ||
    (status === 403 && body.code === 'ACCOUNT_SUSPENDED') ||
    (status === 423 && body.code === 'ACCOUNT_LOCKED')
  );
}
