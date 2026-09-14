// The app's names for backend DTOs. The DTOs themselves are generated from
// the flux-operations OpenAPI spec into `../generated` by `npm run
// api:generate` — never hand-edit them. Call sites keep importing
// `{ Task } from '@core/api'`, so regenerating doesn't touch them.
import type { NotificationResponse, TaskResponse } from '../generated';

export type Task = TaskResponse;
export type AppNotification = NotificationResponse;
