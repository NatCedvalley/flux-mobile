import type {
  MyTasksQuery,
  ProjectMember,
  ProjectTasksQuery,
  Task,
} from '../api';
import type { PersonName } from '../people';
import { DEFAULT_SORT, type GroupBy, type TaskGroup } from '../project-list';

export type Priority = NonNullable<Task['priority']>;

/** The priorities, highest first, with their labels. */
export const PRIORITY_OPTIONS: readonly { value: Priority; label: string }[] = [
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

/**
 * The project list's sorts, from the server's whitelist (`field,dir`). Each
 * runs in the direction people expect of it; null due dates sort last.
 */
export const SORT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: DEFAULT_SORT, label: 'Newest first' },
  { value: 'updatedAt,desc', label: 'Recently updated' },
  { value: 'dueDate,asc', label: 'Due date' },
  { value: 'priority,desc', label: 'Priority' },
  { value: 'taskNumber,asc', label: 'Key' },
  { value: 'title,asc', label: 'Title A–Z' },
];

/**
 * A project list's filters. Values are ORed within a filter and filters are
 * ANDed, as the server applies them.
 */
export type TaskFilters = {
  statuses: readonly string[];
  priorities: readonly Priority[];
  assigneeIds: readonly string[];
};

export const EMPTY_FILTERS: TaskFilters = {
  statuses: [],
  priorities: [],
  assigneeIds: [],
};

/** My Work search's filters. Statuses belong to the chosen project. */
export type MyTaskFilters = {
  projectId?: string;
  statuses: readonly string[];
  priorities: readonly Priority[];
};

export const EMPTY_MY_TASK_FILTERS: MyTaskFilters = {
  statuses: [],
  priorities: [],
};

/** A comma-separated list, or undefined (left out of the query) when empty. */
function csv(values: readonly string[]): string | undefined {
  return values.length ? values.join(',') : undefined;
}

/** How many filters are in use (not how many values): the Filters badge. */
export function activeFilterCount(
  filters: TaskFilters | MyTaskFilters
): number {
  const lists =
    'assigneeIds' in filters
      ? [filters.statuses, filters.priorities, filters.assigneeIds]
      : [filters.statuses, filters.priorities];
  return (
    lists.filter((list) => list.length > 0).length +
    ('projectId' in filters && filters.projectId ? 1 : 0)
  );
}

/** The project task list's query params for `filters`. */
export function filterQuery(
  filters: TaskFilters
): Pick<ProjectTasksQuery, 'assigneeId' | 'priority' | 'status'> {
  return {
    status: csv(filters.statuses),
    priority: csv(filters.priorities),
    assigneeId: csv(filters.assigneeIds),
  };
}

/** My tasks' query params for `filters`. */
export function myTaskFilterQuery(
  filters: MyTaskFilters
): Pick<MyTasksQuery, 'priority' | 'projectId' | 'status'> {
  return {
    projectId: filters.projectId,
    status: csv(filters.statuses),
    priority: csv(filters.priorities),
  };
}

/**
 * A grouped list's groups and base query under `filters`. Each group fetches
 * with its own `status` (or `priority`), which would override the same key
 * in the base query, so a filter on the grouped field keeps just the groups
 * it selects instead.
 */
export function filteredGroups(
  groupBy: GroupBy,
  groups: readonly TaskGroup[],
  filters: TaskFilters
): { groups: TaskGroup[]; query: ProjectTasksQuery } {
  const query = filterQuery(filters);
  const narrowBy = (selected: readonly string[]) =>
    groups.filter((g) => !selected.length || selected.includes(g.key));
  switch (groupBy) {
    case 'status':
      return {
        groups: narrowBy(filters.statuses),
        query: { ...query, status: undefined },
      };
    case 'priority':
      return {
        groups: narrowBy(filters.priorities),
        query: { ...query, priority: undefined },
      };
    default:
      return { groups: [...groups], query };
  }
}

/** An assignee filter row: the member, labelled "Me" for the caller. */
export type AssigneeOption = {
  accountId: string;
  label: string;
  person: PersonName;
};

/**
 * The assignee filter's rows: the caller first as "Me", then everyone else
 * by name. The server lists members in no particular order.
 */
export function assigneeOptions(
  members: readonly ProjectMember[],
  myAccountId: string | undefined
): AssigneeOption[] {
  const name = (m: ProjectMember) =>
    [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email || '';
  return members
    .filter((m): m is ProjectMember & { accountId: string } => !!m.accountId)
    .map((m) => ({
      accountId: m.accountId,
      label: m.accountId === myAccountId ? 'Me' : name(m),
      person: m,
    }))
    .sort(
      (a, b) =>
        Number(b.accountId === myAccountId) -
          Number(a.accountId === myAccountId) || a.label.localeCompare(b.label)
    );
}
