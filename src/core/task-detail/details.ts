import type { Task, TaskComment } from '../api';
import { dayMonth, isOverdue, localIsoDate } from '../my-work';

type Assignee = NonNullable<Task['assignees']>[number];

/**
 * The Details due-date row: `Today`, `17 Sep`, or `12 Sep · overdue`. A
 * closed task is never overdue.
 */
export function detailDue(
  task: Pick<Task, 'dueDate' | 'statusCategory'>,
  today: string
): { label: string; overdue: boolean } {
  const due = task.dueDate;
  if (!due) {
    return { label: 'No due date', overdue: false };
  }
  if (due === today) {
    return { label: 'Today', overdue: false };
  }
  const label = dayMonth(due, today);
  return isOverdue(task, today) && task.statusCategory !== 'DONE'
    ? { label: `${label} · overdue`, overdue: true }
    : { label, overdue: false };
}

/**
 * The design shows one assignee: the first, plus how many more there are
 * (a task can have several).
 */
export function assigneeSummary(assignees: Task['assignees']): {
  first: Assignee | undefined;
  more: number;
} {
  const list = assignees ?? [];
  return { first: list[0], more: Math.max(list.length - 1, 0) };
}

/** A comment's age: `now`, `5m`, `3h`, `2d`, then `12 Sep`. */
export function relativeTime(iso: string | undefined, now: Date): string {
  if (!iso) {
    return '';
  }
  const then = new Date(iso);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) {
    return 'now';
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  if (minutes < 24 * 60) {
    return `${Math.floor(minutes / 60)}h`;
  }
  if (minutes < 7 * 24 * 60) {
    return `${Math.floor(minutes / (24 * 60))}d`;
  }
  return dayMonth(localIsoDate(then), localIsoDate(now));
}

/** `08:12`, on the device's clock. */
export function timeOfDay(iso: string | undefined): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Every comment on the task, replies included. The server's total only
 * counts top-level comments, so the loaded threads are counted in full and
 * any thread not loaded yet counts as one.
 */
export function commentCount(loaded: TaskComment[], total: number): number {
  const replies = loaded.reduce((n, c) => n + (c.replies?.length ?? 0), 0);
  return Math.max(total, loaded.length) + replies;
}
