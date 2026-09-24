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

/**
 * True for failures worth retrying later (no response, or a 5xx such as
 * `KEYCLOAK_UNAVAILABLE`), as opposed to the server rejecting the request.
 */
export function isTransient(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.status === 0 || error.status >= 500)
  );
}
