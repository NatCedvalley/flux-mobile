import type { TaskActivity } from '../api';
import { dayMonth, localIsoDate } from '../my-work';
import { priorityFact } from '../project-list';

/** The tint of an activity's badge (3g), one of the theme's hues. */
export type ActivityTone = 'amber' | 'gray' | 'green' | 'red' | 'violet';

/**
 * How one activity entry reads: `<actor> <verb> <target>`, or `<actor>
 * <verb> <from> → <to>`. A status change carries workflow slugs, for the
 * page to show as status pills by name.
 */
export type ActivityView = {
  icon: string;
  tone: ActivityTone;
  verb: string;
  /** A person or release, shown in bold after the verb. */
  target?: string;
  change?: {
    kind: 'priority' | 'status' | 'text';
    from: string;
    to: string;
  };
};

export type ActivityDay = {
  /** The local day, `YYYY-MM-DD`. */
  day: string;
  label: string;
  entries: TaskActivity[];
};

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTHS = [
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

/**
 * Entries (newest first, as the server sends them) under day headers:
 * `Today`, `Yesterday`, then `Friday 11 September`, with the year when it
 * isn't this year's.
 */
export function activityDays(
  entries: readonly TaskActivity[],
  now: Date
): ActivityDay[] {
  const today = localIsoDate(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const days: ActivityDay[] = [];
  for (const entry of entries) {
    const date = entry.createdAt ? new Date(entry.createdAt) : now;
    const day = localIsoDate(date);
    let group = days.at(-1);
    if (group?.day !== day) {
      group = { day, label: dayLabel(date, today, yesterday), entries: [] };
      days.push(group);
    }
    group.entries.push(entry);
  }
  return days;
}

function dayLabel(date: Date, today: string, yesterday: Date): string {
  const day = localIsoDate(date);
  if (day === today) {
    return 'Today';
  }
  if (day === localIsoDate(yesterday)) {
    return 'Yesterday';
  }
  const label = `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return today.startsWith(`${date.getFullYear()}-`)
    ? label
    : `${label} ${date.getFullYear()}`;
}

/** How an entry reads, its icon and tint; `today` formats date values. */
export function activityView(entry: TaskActivity, today: string): ActivityView {
  const from = entry.oldValueDisplay ?? entry.oldValue ?? '';
  const to = entry.newValueDisplay ?? entry.newValue ?? '';
  switch (entry.action) {
    case 'CREATED':
      return { icon: 'plus', tone: 'green', verb: 'created this task' };
    case 'STATUS_CHANGED':
      return statusChange('changed status', entry);
    case 'ASSIGNED':
      return { icon: 'user', tone: 'gray', verb: 'assigned to', target: to };
    case 'UNASSIGNED':
      return { icon: 'user', tone: 'gray', verb: 'unassigned', target: from };
    case 'FIELD_UPDATED':
      return fieldChange(entry, from, to, today);
    case 'COMMENT_ADDED':
      return { icon: 'message-circle', tone: 'gray', verb: 'added a comment' };
    case 'COMMENT_EDITED':
      return { icon: 'message-circle', tone: 'gray', verb: 'edited a comment' };
    case 'COMMENT_DELETED':
      return { icon: 'trash-2', tone: 'gray', verb: 'deleted a comment' };
    case 'LINKED_TO_RELEASE':
      return release('linked to release', to);
    case 'UNLINKED_FROM_RELEASE':
      return release('unlinked from release', from);
    case 'CLOSED_BY_RELEASE':
      return release('closed by release', to);
    case 'ARCHIVED':
      return { icon: 'archive', tone: 'gray', verb: 'archived this task' };
    case 'UNARCHIVED':
      return { icon: 'history', tone: 'gray', verb: 'unarchived this task' };
    default:
      return { icon: 'circle', tone: 'gray', verb: 'updated this task' };
  }
}

function statusChange(verb: string, entry: TaskActivity): ActivityView {
  return {
    icon: 'circle-dot',
    tone: 'amber',
    verb,
    change: {
      kind: 'status',
      from: entry.oldValue ?? '',
      to: entry.newValue ?? '',
    },
  };
}

function release(verb: string, target: string): ActivityView {
  return { icon: 'package', tone: 'violet', verb, target };
}

/** The fields flux-operations records `FIELD_UPDATED` for (`TaskService`). */
function fieldChange(
  entry: TaskActivity,
  from: string,
  to: string,
  today: string
): ActivityView {
  const text = (verb: string, a: string, b: string, icon = 'pencil') => ({
    icon,
    tone: 'gray' as const,
    verb,
    change: { kind: 'text' as const, from: a || 'none', to: b || 'none' },
  });
  const date = (value: string) => (value ? dayMonth(value, today) : '');
  switch (entry.field) {
    case 'status':
      // Moved by the server, e.g. when every subtask is done.
      return statusChange('auto-changed status', entry);
    case 'priority':
      return {
        icon: 'chevrons-up',
        tone: 'red',
        verb: 'changed priority',
        change: {
          kind: 'priority',
          from: priorityLabel(from),
          to: priorityLabel(to),
        },
      };
    case 'description':
      return { icon: 'pencil', tone: 'gray', verb: 'updated the description' };
    case 'title':
      return text('renamed the task', from, to);
    case 'type':
      return text('changed the type', capitalize(from), capitalize(to));
    case 'dueDate':
      return text('changed the due date', date(from), date(to), 'calendar');
    case 'plannedStartDate':
      return text('changed the start date', date(from), date(to), 'calendar');
    case 'plannedEndDate':
      return text('changed the end date', date(from), date(to), 'calendar');
    case 'parentTaskId':
      // Its values are task ids, which mean nothing to a reader.
      return { icon: 'layers', tone: 'gray', verb: 'changed the parent' };
    default:
      return text(`updated ${humanize(entry.field ?? 'a field')}`, from, to);
  }
}

function priorityLabel(value: string): string {
  return (
    priorityFact(value as Parameters<typeof priorityFact>[0])?.label ??
    (value || 'none')
  );
}

function capitalize(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1).toLowerCase() : '';
}

/** `affectedVersion` → `affected version`. */
function humanize(field: string): string {
  return field.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}
