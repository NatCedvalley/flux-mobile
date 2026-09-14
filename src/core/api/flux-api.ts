import type { AppNotification, Task } from './types';

/**
 * Thin, framework-agnostic interface over the Flux backend. Promise-based
 * (not rxjs) so an Angular `HttpClient` implementation and, later, a
 * Flutter/native implementation can both satisfy it.
 *
 * Covers only the endpoints the current placeholder pages need. Add methods
 * here as pages need them.
 */
export type FluxApi = {
  /** GET /api/tasks */
  listTasks(): Promise<Task[]>;

  /** GET /api/tasks/{id} */
  getTask(id: string): Promise<Task>;

  /** GET /api/notifications */
  listNotifications(): Promise<AppNotification[]>;
};
