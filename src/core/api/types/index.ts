// The app's names for backend DTOs. The DTOs themselves are generated from
// the flux-operations and flux-iam OpenAPI specs into `../generated` by `npm
// run api:generate` — never hand-edit them. Call sites keep importing
// `{ Task } from '@core/api'`, so regenerating doesn't touch them.
import type {
  AccountResponse,
  AuthResponse,
  LoginRequest as IamLoginRequest,
  RefreshTokenRequest as IamRefreshTokenRequest,
} from '../generated/iam';
import type {
  NotificationResponse,
  TaskResponse,
} from '../generated/operations';

export type Task = TaskResponse;
export type AppNotification = NotificationResponse;

export type Account = AccountResponse;
export type AuthTokens = AuthResponse;
export type LoginRequest = IamLoginRequest;
export type RefreshTokenRequest = IamRefreshTokenRequest;
