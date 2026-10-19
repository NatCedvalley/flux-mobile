/**
 * The data a Flux push carries (flux-operations' PushDeliveryService), all
 * strings. `notificationId` and `type` are always sent; the entity fields
 * are left out when the notification has none. For comment, mention and
 * reaction types `entityId` is the task, not the comment.
 */
export type PushMessage = {
  notificationId: string;
  type: string;
  entityType?: string;
  entityId?: string;
  projectId?: string;
};

/** Where tapping a push goes: its task, or the Inbox when it has none. */
export type PushTarget =
  { kind: 'task'; projectId: string; taskId: string } | { kind: 'inbox' };

/**
 * Reads a push's data. Only the string fields Flux sends are kept: iOS adds
 * its own keys (`aps`, `gcm.message_id`). Null without `notificationId` or
 * `type`, which every Flux push has.
 */
export function parsePushData(data: unknown): PushMessage | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const record = data as Record<string, unknown>;
  const field = (key: string) =>
    typeof record[key] === 'string' && record[key] !== ''
      ? (record[key] as string)
      : undefined;
  const notificationId = field('notificationId');
  const type = field('type');
  if (!notificationId || !type) {
    return null;
  }
  return {
    notificationId,
    type,
    entityType: field('entityType'),
    entityId: field('entityId'),
    projectId: field('projectId'),
  };
}

/**
 * A push opens its task like an Inbox row does (`opensTask()` in
 * `@core/inbox`), without the row's key check: a push doesn't carry the
 * key. A release, a deleted task, or anything missing an id opens the Inbox.
 */
export function pushTarget(message: PushMessage | null): PushTarget {
  if (
    message?.entityType === 'TASK' &&
    message.type !== 'TASK_DELETED' &&
    message.projectId &&
    message.entityId
  ) {
    return {
      kind: 'task',
      projectId: message.projectId,
      taskId: message.entityId,
    };
  }
  return { kind: 'inbox' };
}
