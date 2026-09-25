// Public surface of the auth layer. Import from '@core/auth'.
export {
  ApiError,
  SESSION_EXPIRED_MESSAGE,
  endsSession,
  isTransient,
  type ErrorResponse,
} from './api-error';
export { AuthClient, type FetchFn } from './auth-client';
export { AuthSession, type AuthState } from './auth-session';
export {
  MemoryTokenStore,
  isStoredSession,
  type StoredSession,
  type TokenStore,
} from './token-store';
