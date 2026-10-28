import type { Task, WorkflowStatus } from '../api';

/** Firebase's limit on a `screen_view`'s screen name. */
export const SCREEN_NAME_MAX = 100;

/**
 * The only usage events the app logs (FM-64). Every parameter is one of a
 * fixed set of values, so no title, name or other content can get in.
 */
export type AnalyticsEvent =
  /** A password sign-in. `login` is GA's recommended name. */
  | { name: 'login'; params: { method: 'password' } }
  /** A status change the person made (not its Undo), sent or queued. */
  | {
      name: 'status_change';
      params: {
        outcome: 'sent' | 'queued';
        /** The new status's category; left out if the status has none. */
        category?: WorkflowStatus['category'];
      };
    }
  | { name: 'comment_post'; params: { outcome: 'sent' | 'queued' } }
  | { name: 'task_create'; params: { type: NonNullable<Task['type']> } }
  /** `notification_open` is reserved by Firebase. */
  | {
      name: 'push_open';
      params: { from: 'tap' | 'toast'; target: 'task' | 'inbox' };
    }
  /** The connection went, or a cold start found it gone. */
  | { name: 'offline_start'; params: Record<string, never> };

/**
 * A screen's name: the matched routes' patterns from the root down, e.g.
 * `tabs/inbox/tasks/:projectId/:taskId`. Built from the route config, never
 * the URL, so ids and query strings stay out. Empty paths are skipped.
 */
export function screenName(paths: readonly (string | undefined)[]): string {
  const name = paths.filter((path) => !!path).join('/');
  return name.slice(0, SCREEN_NAME_MAX);
}
