import type { ProjectTasksQuery, Task, WorkflowStatus } from '../api';
import type { GroupBy } from './view-settings';

/**
 * The hues a group header can take: the status hues the theme defines, and
 * gray. Each has a 9 (dot), an 11 (text) and a wash.
 */
export type GroupHue =
  'amber' | 'blue' | 'cyan' | 'gray' | 'green' | 'purple' | 'red';

/** flux-web's status colour names that the theme has a hue for. */
const STATUS_COLOR_HUES: Partial<Record<string, GroupHue>> = {
  amber: 'amber',
  blue: 'blue',
  cyan: 'cyan',
  green: 'green',
  neutral: 'gray',
  purple: 'purple',
  red: 'red',
};

/** A category's hue, as My Work's status dot uses it. */
const CATEGORY_HUES: Record<NonNullable<Task['statusCategory']>, GroupHue> = {
  PLANNING: 'gray',
  TODO: 'blue',
  IN_PROGRESS: 'amber',
  DONE: 'green',
};

/**
 * A workflow status's hue: its own colour where the theme has that hue,
 * otherwise (pink, orange, teal, or none) its category's.
 */
export function statusHue(
  color: string | undefined,
  category: WorkflowStatus['category']
): GroupHue {
  return (
    (color ? STATUS_COLOR_HUES[color] : undefined) ??
    CATEGORY_HUES[category ?? 'PLANNING']
  );
}

/**
 * One group of a project's task list: its header and the filter that fetches
 * just its tasks. `label` is null for the single group of an ungrouped list.
 */
export type TaskGroup = {
  key: string;
  label: string | null;
  hue: GroupHue;
  query: ProjectTasksQuery;
};

/** flux-web's orders for priority and type groups. */
const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
const PRIORITY_HUES: Record<(typeof PRIORITIES)[number], GroupHue> = {
  CRITICAL: 'red',
  HIGH: 'amber',
  MEDIUM: 'gray',
  LOW: 'gray',
};
const TYPES = [
  'MASTER',
  'EPIC',
  'BUG',
  'FEATURE',
  'TASK',
  'IMPROVEMENT',
] as const;

/** `IN_PROGRESS` → `In progress`. */
function enumLabel(value: string): string {
  const words = value.toLowerCase().replace(/_/g, ' ');
  return words[0].toUpperCase() + words.slice(1);
}

/**
 * The groups of a project's task list, in flux-web's order. Status groups
 * follow the project's category order (`categoryPositions`, a missing
 * category last), then each status's position. Tasks whose status isn't in
 * the workflow belong to no group.
 */
export function taskGroups(
  groupBy: GroupBy,
  statuses: readonly WorkflowStatus[],
  categoryPositions: Readonly<Record<string, number>> = {}
): TaskGroup[] {
  switch (groupBy) {
    case 'none':
      return [{ key: 'all', label: null, hue: 'gray', query: {} }];
    case 'priority':
      return PRIORITIES.map((priority) => ({
        key: priority,
        label: enumLabel(priority),
        hue: PRIORITY_HUES[priority],
        query: { priority },
      }));
    case 'type':
      return TYPES.map((type) => ({
        key: type,
        label: enumLabel(type),
        hue: 'gray',
        query: { type },
      }));
    case 'status': {
      const categoryOrder = (status: WorkflowStatus) =>
        categoryPositions[status.category ?? ''] ?? 99;
      return statuses
        .filter((status) => !!status.slug)
        .sort(
          (a, b) =>
            categoryOrder(a) - categoryOrder(b) ||
            (a.position ?? 0) - (b.position ?? 0)
        )
        .map((status) => ({
          key: status.slug!,
          label: status.name ?? status.slug!,
          hue: statusHue(status.color, status.category),
          query: { status: status.slug },
        }));
    }
  }
}
