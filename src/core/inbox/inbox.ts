import type { AppNotification } from '../api';
import type { ActivityTone } from '../task-detail';
import { localIsoDate } from '../my-work';
import { avatarFillIndex, initials } from '../people';

export type InboxSegment = 'all' | 'mentions' | 'assigned';

/** The notification types that are mentions, which need a reply. */
export const MENTION_TYPES = ['MENTION', 'DESCRIPTION_MENTION'];

/**
 * The Inbox's segments (handoff 3l), each one `type` filter on
 * GET /notifications: All has none.
 */
export const INBOX_SEGMENTS: readonly {
  key: InboxSegment;
  label: string;
  type?: string;
}[] = [
  { key: 'all', label: 'All' },
  { key: 'mentions', label: 'Mentions', type: MENTION_TYPES.join(',') },
  { key: 'assigned', label: 'Assigned', type: 'ASSIGNMENT' },
];

/** Whether a notification counts toward the Mentions segment. */
export function isMention(notification: AppNotification): boolean {
  return MENTION_TYPES.includes(notification.type ?? '');
}

/** The types that lead with the actor's avatar, when there is an actor. */
const AVATAR_TYPES = ['COMMENT', 'MENTION', 'DESCRIPTION_MENTION', 'REACTION'];

/** Each type's glyph and tint, as Activity draws the same events. */
const GLYPHS: Record<string, { icon: string; tone: ActivityTone }> = {
  ASSIGNMENT: { icon: 'circle-dot', tone: 'amber' },
  RELEASE_CREATED: { icon: 'package', tone: 'violet' },
  TASK_CREATED: { icon: 'plus', tone: 'green' },
  TASK_ARCHIVED: { icon: 'archive', tone: 'gray' },
  TASK_RESTORED: { icon: 'refresh-cw', tone: 'gray' },
  TASK_DELETED: { icon: 'trash-2', tone: 'red' },
  TASK_UPDATED: { icon: 'pencil', tone: 'gray' },
  COMMENT: { icon: 'message-circle', tone: 'gray' },
  MENTION: { icon: 'at-sign', tone: 'gray' },
  DESCRIPTION_MENTION: { icon: 'at-sign', tone: 'gray' },
  REACTION: { icon: 'smile-plus', tone: 'gray' },
};
const DEFAULT_GLYPH = { icon: 'bell', tone: 'gray' as const };

/** The row's leading element: the actor's avatar, or the event's glyph. */
export type NotificationLeading =
  | { kind: 'avatar'; initials: string; fillIndex: number }
  | { kind: 'glyph'; icon: string; tone: ActivityTone };

/** How an Inbox row shows a notification. */
export type NotificationView = {
  /** Bold: the actor's name, or the whole prefix when there is no actor. */
  lead: string;
  /** What the actor did ("mentioned you in"), if the message names them. */
  verb?: string;
  /** The task's title, or whatever the message is about. */
  subject: string;
  leading: NotificationLeading;
  taskKey?: string;
  projectName?: string;
  /** Tapping opens the task: it's a task row that still exists. */
  opensTask: boolean;
};

/**
 * Splits a notification for its row. The server writes every message as
 * `<actor><verb>: <subject>` ("Ben Tan mentioned you in: Fix 3DS…"), and
 * since FM-42 names the actor, so the name leads and the rest is the verb.
 * An older row has no actor, so its whole prefix leads; a message without
 * the colon leads with the title.
 */
export function notificationView(n: AppNotification): NotificationView {
  const message = n.message ?? '';
  const colon = message.indexOf(': ');
  const actor = [n.actorFirstName, n.actorLastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  let lead: string;
  let verb: string | undefined;
  let subject: string;
  if (colon < 0) {
    lead = n.title ?? '';
    subject = message;
  } else {
    const prefix = message.slice(0, colon);
    subject = message.slice(colon + 2);
    if (actor && prefix.startsWith(actor) && prefix.length > actor.length) {
      lead = actor;
      verb = prefix.slice(actor.length).trim();
    } else {
      lead = prefix;
    }
  }

  const type = n.type ?? '';
  const leading: NotificationLeading =
    AVATAR_TYPES.includes(type) && n.actorId
      ? {
          kind: 'avatar',
          initials: initials({
            firstName: n.actorFirstName,
            lastName: n.actorLastName,
          }),
          fillIndex: avatarFillIndex(n.actorId),
        }
      : { kind: 'glyph', ...(GLYPHS[type] ?? DEFAULT_GLYPH) };

  return {
    lead,
    verb,
    subject,
    leading,
    taskKey: n.taskKey,
    projectName: n.projectName,
    opensTask: opensTask(n),
  };
}

/**
 * Whether tapping the row opens its task. A release, a deleted task, or a
 * row from before FM-42 (no key: it may name a task deleted since) only
 * marks itself read.
 */
export function opensTask(n: AppNotification): boolean {
  return (
    n.entityType === 'TASK' &&
    n.type !== 'TASK_DELETED' &&
    !!n.projectId &&
    !!n.entityId &&
    !!n.taskKey
  );
}

export type InboxGroup = {
  key: 'today' | 'earlier';
  label: string;
  items: AppNotification[];
};

/**
 * Today and Earlier, by the local day of `createdAt`, each in the server's
 * order (newest first). An empty group is left out.
 */
export function inboxGroups(items: AppNotification[], now: Date): InboxGroup[] {
  const today = localIsoDate(now);
  const isToday = (n: AppNotification) =>
    !!n.createdAt && localIsoDate(new Date(n.createdAt)) === today;
  const groups: InboxGroup[] = [
    { key: 'today', label: 'Today', items: items.filter(isToday) },
    {
      key: 'earlier',
      label: 'Earlier',
      items: items.filter((n) => !isToday(n)),
    },
  ];
  return groups.filter((g) => g.items.length > 0);
}
