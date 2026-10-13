import type { Page, Task } from '../api';
import type { TaskChange } from '../task-edit';
import { addDays, daysBetween, localIsoDate } from '../my-work';

// The project calendar's month grid (handoff 3d). Months are `YYYY-MM` and
// days `YYYY-MM-DD`, worked out from their parts in local time and never
// parsed as UTC instants (see `my-work/dates.ts`).

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** One day of the grid. */
export type CalendarDay = {
  iso: string;
  /** The day of the month. */
  day: number;
  /** False for the days of the months either side that fill the weeks. */
  inMonth: boolean;
  weekend: boolean;
  today: boolean;
};

/** The days a task covers, first and last inclusive. */
export type TaskSpan = { start: string; end: string };

/** The fields a reschedule changes, and Undo puts back. */
export type TaskSchedule = Pick<
  Task,
  'dueDate' | 'plannedStartDate' | 'plannedEndDate'
>;

/** The month `isoDate` falls in. */
export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** `month` moved by `months` (negative goes back). */
export function shiftMonth(month: string, months: number): string {
  const [year, number] = month.split('-').map(Number);
  return monthOf(localIsoDate(new Date(year, number - 1 + months, 1)));
}

/** `October 2026`. */
export function monthTitle(month: string): string {
  const [year, number] = month.split('-').map(Number);
  return `${MONTH_NAMES[number - 1]} ${year}`;
}

/** 0 for Monday … 6 for Sunday: the grid's weeks start on Monday. */
function weekday(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return (new Date(year, month - 1, day).getDay() + 6) % 7;
}

/**
 * The days the grid shows: from the Monday on or before the 1st to the
 * Sunday on or after the month's last day. This is the window the calendar
 * asks for (`dueDateFrom`/`dueDateTo`).
 */
export function monthWindow(month: string): { from: string; to: string } {
  const first = `${month}-01`;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  return {
    from: addDays(first, -weekday(first)),
    to: addDays(last, 6 - weekday(last)),
  };
}

/** The grid's weeks, Monday first: four to six, as the month needs. */
export function monthGrid(month: string, today: string): CalendarDay[][] {
  const { from, to } = monthWindow(month);
  const weeks: CalendarDay[][] = [];
  for (let iso = from; iso <= to; iso = addDays(iso, 1)) {
    if (weekday(iso) === 0) {
      weeks.push([]);
    }
    weeks[weeks.length - 1].push({
      iso,
      day: Number(iso.slice(8)),
      inMonth: monthOf(iso) === month,
      weekend: weekday(iso) >= 5,
      today: iso === today,
    });
  }
  return weeks;
}

/**
 * The days a task covers, as the server places it: the planned range when
 * it has one, else its due date. Undefined for an unscheduled task.
 */
export function taskSpan(task: TaskSchedule): TaskSpan | undefined {
  const start = task.plannedStartDate ?? task.dueDate;
  if (!start) {
    return undefined;
  }
  const end = task.plannedEndDate ?? task.dueDate ?? start;
  return { start, end: end < start ? start : end };
}

/**
 * The tasks on each day from `from` to `to`, in the order given. A task with
 * a planned range is on every day of it that the window shows.
 */
export function tasksByDay(
  tasks: readonly Task[],
  from: string,
  to: string
): Map<string, Task[]> {
  const days = new Map<string, Task[]>();
  for (const task of tasks) {
    const span = taskSpan(task);
    if (!span) {
      continue;
    }
    const last = span.end < to ? span.end : to;
    for (let iso = span.start > from ? span.start : from; iso <= last;) {
      days.set(iso, [...(days.get(iso) ?? []), task]);
      iso = addDays(iso, 1);
    }
  }
  return days;
}

/**
 * What a day cell shows in its `lines` (2 in the handoff): every task when
 * they fit, else one line fewer and `+n more` on the last.
 */
export function dayLines(
  tasks: readonly Task[],
  lines = 2
): { pills: Task[]; more: number } {
  if (tasks.length <= lines) {
    return { pills: [...tasks], more: 0 };
  }
  return {
    pills: tasks.slice(0, lines - 1),
    more: tasks.length - (lines - 1),
  };
}

/** Whether a task's span ended before `today` while it was still open. */
export function isOverdueSpan(task: Task, today: string): boolean {
  const span = taskSpan(task);
  return !!span && span.end < today && task.statusCategory !== 'DONE';
}

/**
 * The change that moves `task` from the day it was dragged from (undefined
 * from the Unscheduled drawer) onto `toDay`, as flux-web does it. A task
 * with a planned range moves the whole range, keeping its length; anything
 * else gets `toDay` as its due date. Undefined when nothing would change.
 */
export function rescheduleChange(
  task: Task,
  fromDay: string | undefined,
  toDay: string
): TaskChange | undefined {
  if (fromDay === toDay) {
    return undefined;
  }
  const { plannedStartDate, plannedEndDate } = task;
  if (fromDay && plannedStartDate && plannedEndDate) {
    const shift = daysBetween(fromDay, toDay);
    return {
      plannedStartDate: addDays(plannedStartDate, shift),
      plannedEndDate: addDays(plannedEndDate, shift),
    };
  }
  return task.dueDate === toDay ? undefined : { dueDate: toDay };
}

/** A task's dates, for Undo to put back. */
export function scheduleOf(task: Task): TaskSchedule {
  return {
    dueDate: task.dueDate,
    plannedStartDate: task.plannedStartDate,
    plannedEndDate: task.plannedEndDate,
  };
}

/**
 * Every item of a paged list, fetched one page after another until the
 * server says it was the last (the server caps a page at 100).
 */
export async function allPages<T>(
  fetchPage: (page: number, size: number) => Promise<Page<T>>,
  size = 100
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 0; ; page++) {
    const result = await fetchPage(page, size);
    const content = result.content ?? [];
    items.push(...content);
    const total = result.totalElements ?? items.length;
    if (!content.length || (result.last ?? items.length >= total)) {
      return items;
    }
  }
}
