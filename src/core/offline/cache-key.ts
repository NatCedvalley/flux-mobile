import type { FluxApi, MyTasksQuery } from '../api';
import { PROJECT_PAGE_SIZE } from '../project-list';

type Rules = {
  [Method in keyof FluxApi]?: (...args: Parameters<FluxApi[Method]>) => boolean;
};

/**
 * The reads the cache keeps, and when each call is worth keeping: My Work,
 * the Projects list, task detail and the Inbox, first pages only. Board,
 * Calendar and search are left out, as are later pages (an offline "load
 * more" says it needs a connection instead).
 */
const CACHED: Rules = {
  // My Work's segments; its search sends `openOnly=false`.
  listMyTasks: (query) =>
    firstPage(query) && !query?.search && query?.openOnly !== false,
  // The Projects list's groups. The board asks for 100 rows a page, and the
  // calendar for a date window or the unscheduled tasks.
  listProjectTasks: (_projectId, query) =>
    firstPage(query) &&
    (query?.size ?? PROJECT_PAGE_SIZE) <= PROJECT_PAGE_SIZE &&
    !query?.search &&
    !query?.dueDateFrom &&
    !query?.dueDateTo &&
    !query?.onlyUnscheduled,
  listTaskComments: (_projectId, _taskId, query) => firstPage(query),
  listTaskActivities: (_projectId, _taskId, query) => firstPage(query),
  listNotifications: (query) => firstPage(query),
  listMyProjects: always,
  getTaskViewSettings: always,
  listWorkflowStatuses: always,
  // Kept for closed statuses picked while offline (FM-49).
  listResolutions: always,
  getTask: always,
  listChildTasks: always,
  listTaskAttachments: always,
  listAssignableMembers: always,
  getTaskSubscription: always,
  notificationUnreadCount: always,
};

/**
 * The cache key for a read, or null when it isn't cached: the method name
 * and its arguments as JSON, with object keys sorted so the order a query
 * was built in doesn't matter.
 */
export function cacheKey<Method extends keyof FluxApi>(
  method: Method,
  args: Parameters<FluxApi[Method]>
): string | null {
  const cached = CACHED[method] as
    ((...args: unknown[]) => boolean) | undefined;
  if (!cached?.(...args)) {
    return null;
  }
  const given: unknown[] =
    method === 'listMyTasks' ? [undated(args[0] as MyTasksQuery)] : [...args];
  // An omitted query and an undefined one are the same call.
  while (given.length > 0 && given[given.length - 1] === undefined) {
    given.pop();
  }
  return `${method}:${stableJson(given)}`;
}

/**
 * Focus's due window ends a week from today, so its key would change every
 * day. Keyed without the date, the last one loaded still shows offline the
 * next day: its buckets are worked out from the device's day anyway.
 */
function undated(query?: MyTasksQuery): MyTasksQuery | undefined {
  return query?.dueDateTo ? { ...query, dueDateTo: 'set' } : query;
}

function always(): boolean {
  return true;
}

function firstPage(query?: { page?: number }): boolean {
  return !query?.page;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, field: unknown) =>
    typeof field === 'object' && field !== null && !Array.isArray(field)
      ? Object.fromEntries(
          Object.entries(field).sort(([a], [b]) => (a < b ? -1 : 1))
        )
      : field
  );
}
