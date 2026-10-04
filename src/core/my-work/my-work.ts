import type { MyTask } from '../api';
import { stableIndex } from '../people';
import { addDays, shortDate } from './dates';

/** How far ahead My Work's Focus segment looks. */
export const FOCUS_DAYS = 7;

export type FocusBuckets<T> = { overdue: T[]; today: T[]; next7: T[] };

/**
 * Splits open tasks into Focus's sections by due date: before `today`, on
 * it, and within the next `FOCUS_DAYS` days. Undated and later tasks are
 * left out. Each bucket keeps the input order (the server's priority, then
 * due date).
 */
export function focusBuckets<T extends { dueDate?: string }>(
  tasks: readonly T[],
  today: string
): FocusBuckets<T> {
  const last = addDays(today, FOCUS_DAYS);
  const buckets: FocusBuckets<T> = { overdue: [], today: [], next7: [] };
  for (const task of tasks) {
    const due = task.dueDate;
    if (!due || due > last) {
      continue;
    }
    if (due < today) {
      buckets.overdue.push(task);
    } else if (due === today) {
      buckets.today.push(task);
    } else {
      buckets.next7.push(task);
    }
  }
  return buckets;
}

/** True when an open task's due date has passed. */
export function isOverdue(task: { dueDate?: string }, today: string): boolean {
  return !!task.dueDate && task.dueDate < today;
}

/**
 * The row's second fact, after the status: the priority when it is critical
 * or high, otherwise the due date (`null` when there is none).
 */
export type SecondFact =
  | { kind: 'due'; label: string; overdue: boolean }
  | { kind: 'priority'; level: 'CRITICAL' | 'HIGH'; label: string };

export function secondFact(
  task: Pick<MyTask, 'dueDate' | 'priority'>,
  today: string
): SecondFact | null {
  if (task.priority === 'CRITICAL') {
    return { kind: 'priority', level: 'CRITICAL', label: 'Critical' };
  }
  if (task.priority === 'HIGH') {
    return { kind: 'priority', level: 'HIGH', label: 'High' };
  }
  const due = dueFact(task.dueDate, today);
  return due && { kind: 'due', ...due };
}

/**
 * A due date as a row shows it: `Due today`, `Thu 17 Sep`, or, once past,
 * `Due yesterday` / `Due Thu 10 Sep`. `null` when there is none.
 */
export function dueFact(
  due: string | undefined,
  today: string
): { label: string; overdue: boolean } | null {
  if (!due) {
    return null;
  }
  if (due === today) {
    return { label: 'Due today', overdue: false };
  }
  if (due > today) {
    return { label: shortDate(due, today), overdue: false };
  }
  const label =
    due === addDays(today, -1)
      ? 'Due yesterday'
      : `Due ${shortDate(due, today)}`;
  return { label, overdue: true };
}

/** The status dot's colour family, from the status's category. */
export type StatusTone = 'done' | 'planning' | 'progress' | 'todo';

export function statusTone(category: MyTask['statusCategory']): StatusTone {
  switch (category) {
    case 'TODO':
      return 'todo';
    case 'IN_PROGRESS':
      return 'progress';
    case 'DONE':
      return 'done';
    default:
      return 'planning';
  }
}

/** The hues a project chip can take. Red is kept for overdue and critical. */
export const PROJECT_HUES = [
  'indigo',
  'cyan',
  'amber',
  'purple',
  'green',
  'blue',
  'violet',
] as const;
export type ProjectHue = (typeof PROJECT_HUES)[number];

/** A project's chip hue, always the same for one project. */
export function projectHue(projectId: string): ProjectHue {
  return PROJECT_HUES[stableIndex(projectId, PROJECT_HUES.length)];
}
