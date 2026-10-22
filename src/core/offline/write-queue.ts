import type { FluxApi, Task, TaskComment, WorkflowStatus } from '../api';
import type { CacheStore } from './cache-store';
import { ApiError, endsSession, isTransient } from '../auth/api-error';

/** A status as the queue keeps it: enough to send it and to show it. */
export type QueuedStatus = {
  slug: string;
  name?: string;
  category?: WorkflowStatus['category'];
  isClosed?: boolean;
  /** Only with a closed status. */
  resolution?: string;
};

/**
 * - `queued`: waiting for a connection.
 * - `sending`: on its way (back to `queued` if the app is killed meanwhile).
 * - `conflict`: the task's status changed on the server since; not sent.
 * - `failed`: the server refused it; `message` says why.
 */
export type QueueItemState = 'queued' | 'sending' | 'conflict' | 'failed';

/** A status change made without a connection. */
export type QueuedStatusChange = {
  kind: 'status';
  id: string;
  projectId: string;
  taskId: string;
  taskKey?: string;
  /** The status the task had when the change was made. */
  from: QueuedStatus;
  to: QueuedStatus;
  state: QueueItemState;
  message?: string;
  /** Epoch milliseconds. */
  queuedAt: number;
};

/**
 * A new top-level Markdown comment written without a connection. Comments
 * are append-only, so one is never a conflict, only failed.
 */
export type QueuedComment = {
  kind: 'comment';
  id: string;
  projectId: string;
  taskId: string;
  taskKey?: string;
  body: string;
  mentionedAccountIds: string[];
  state: Exclude<QueueItemState, 'conflict'>;
  message?: string;
  /** Epoch milliseconds. */
  queuedAt: number;
  /** A POST went out and may have reached the server without an answer. */
  attempted?: boolean;
};

export type QueueItem = QueuedStatusChange | QueuedComment;

export type StatusChangeRequest = Pick<
  QueuedStatusChange,
  'projectId' | 'taskId' | 'taskKey' | 'from' | 'to'
>;

export type CommentRequest = Pick<
  QueuedComment,
  | 'projectId'
  | 'taskId'
  | 'taskKey'
  | 'body'
  | 'mentionedAccountIds'
  | 'attempted'
>;

/** What one replayed item came to. */
export type ReplayOutcome =
  /** Sent, or the server already had it. */
  | { kind: 'sent' | 'already'; item: QueuedStatusChange }
  /** Not sent: `task` is the server's copy. */
  | { kind: 'conflict'; item: QueuedStatusChange; task: Task }
  /** Posted, or found already posted: `comment` is the server's. */
  | { kind: 'sent' | 'already'; item: QueuedComment; comment: TaskComment }
  | { kind: 'failed'; item: QueueItem; error: ApiError };

/**
 * How far before its `queuedAt` a comment found on the server may have been
 * created and still count as this one (clocks differ).
 */
export const POSTED_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** The server's largest comment page. */
const COMMENT_CHECK_PAGE_SIZE = 100;

export type WriteQueueOptions = {
  now?: () => number;
};

/** The calls a replay makes, straight to the server (no cache). */
export type ReplayApi = Pick<
  FluxApi,
  'getTask' | 'changeTaskStatus' | 'listTaskComments' | 'addTaskComment'
>;

/**
 * Status changes and new comments made without a connection, in order, for
 * one account at a time, kept in a `CacheStore` (one blob per account) so
 * they survive the app being killed. Another account's changes stay saved
 * but unseen.
 *
 * Status changes to a task merge while queued (its first `from`, its last
 * `to`), and the item is dropped when it's back where it started, which is
 * how Undo cancels one. Comments never merge. `replay` sends everything one
 * at a time, a status change only if the task still has the status it was
 * changed from, and a comment that may already have reached the server
 * only if it isn't there. Every operation runs one at a time, so the list
 * and its blob stay in step.
 */
export class WriteQueue {
  private accountId: string | undefined;
  private list: QueueItem[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private replaying: Promise<ReplayOutcome[]> | null = null;
  private listener: (items: readonly QueueItem[]) => void = () => undefined;
  private commentSent: (item: QueuedComment, comment: TaskComment) => void =
    () => undefined;
  private sequence = 0;
  private readonly now: () => number;

  constructor(
    private readonly store: CacheStore,
    options: WriteQueueOptions = {}
  ) {
    this.now = options.now ?? (() => Date.now());
  }

  get items(): readonly QueueItem[] {
    return this.list;
  }

  /** Called with the new list after every change to it. */
  onChange(listener: (items: readonly QueueItem[]) => void): void {
    this.listener = listener;
  }

  /**
   * Called when a replay posts a comment, or finds it already posted, just
   * before its item leaves the list, so a thread can swap one for the other
   * at once.
   */
  onCommentSent(
    listener: (item: QueuedComment, comment: TaskComment) => void
  ): void {
    this.commentSent = listener;
  }

  /**
   * Switches to `accountId`'s changes. Undefined (no one signed in) shows
   * none, and deletes nothing: they are sent once that account is back.
   */
  load(accountId: string | undefined): Promise<void> {
    return this.run(async () => {
      if (accountId === this.accountId) {
        return;
      }
      this.accountId = accountId;
      this.list =
        accountId === undefined
          ? []
          : parseItems(await this.store.read(blobName(accountId))).map(
              (item) =>
                item.state === 'sending' ? { ...item, state: 'queued' } : item
            );
      this.changed();
    });
  }

  /**
   * Queues a status change, merging it into a queued one for the same task.
   * Resolves with false when no account is loaded.
   */
  enqueueStatus(change: StatusChangeRequest): Promise<boolean> {
    return this.run(async () => {
      if (this.accountId === undefined) {
        return false;
      }
      const to = normalised(change.to);
      const previous = this.latestStatus(change.taskId);
      if (previous?.state === 'queued') {
        this.list = sameStatus(previous.from, to)
          ? this.list.filter((i) => i !== previous)
          : this.list.map((i) => (i === previous ? { ...i, to } : i));
      } else {
        const from =
          previous?.state === 'sending' ? previous.to : normalised(change.from);
        // A conflict or failure is replaced by the newer change.
        const kept =
          previous && previous.state !== 'sending'
            ? this.list.filter((i) => i !== previous)
            : this.list;
        this.list = sameStatus(from, to)
          ? kept
          : [
              ...kept,
              {
                kind: 'status',
                id: this.newId(),
                projectId: change.projectId,
                taskId: change.taskId,
                taskKey: change.taskKey,
                from,
                to,
                state: 'queued',
                queuedAt: this.now(),
              },
            ];
      }
      await this.save();
      return true;
    });
  }

  /**
   * Queues a new comment after everything already queued. Resolves with
   * false when no account is loaded.
   */
  enqueueComment(comment: CommentRequest): Promise<boolean> {
    return this.run(async () => {
      if (this.accountId === undefined) {
        return false;
      }
      this.list = [
        ...this.list,
        {
          kind: 'comment',
          id: this.newId(),
          projectId: comment.projectId,
          taskId: comment.taskId,
          taskKey: comment.taskKey,
          body: comment.body,
          mentionedAccountIds: [...comment.mentionedAccountIds],
          state: 'queued',
          queuedAt: this.now(),
          ...(comment.attempted ? { attempted: true } : {}),
        },
      ];
      await this.save();
      return true;
    });
  }

  /** The task's latest status change still to settle: queued, sending or a conflict. */
  pending(taskId: string): QueuedStatusChange | undefined {
    const item = this.latestStatus(taskId);
    return item?.state === 'failed' ? undefined : item;
  }

  /** The status a queued or sending change will give the task. */
  queuedStatus(taskId: string): QueuedStatus | undefined {
    const item = this.latestStatus(taskId);
    return item?.state === 'queued' || item?.state === 'sending'
      ? item.to
      : undefined;
  }

  /** Whether the task has a comment still to post (queued or sending). */
  commentPending(taskId: string): boolean {
    return this.list.some(
      (i) =>
        i.kind === 'comment' &&
        i.taskId === taskId &&
        (i.state === 'queued' || i.state === 'sending')
    );
  }

  /**
   * Forgets the task's status conflicts and failures once a newer status
   * change to it has reached the server: they no longer say anything about
   * the task. Failed comments stay until they're discarded.
   */
  dropUnsent(taskId: string): Promise<void> {
    return this.run(async () => {
      const kept = this.list.filter(
        (i) =>
          i.kind !== 'status' ||
          i.taskId !== taskId ||
          i.state === 'queued' ||
          i.state === 'sending'
      );
      if (kept.length !== this.list.length) {
        this.list = kept;
        await this.save();
      }
    });
  }

  /** Removes a failed item, which the person has given up on. */
  discard(id: string): Promise<void> {
    return this.run(() => this.remove(id, (i) => i.state === 'failed'));
  }

  /**
   * Sends the queued items in order, one at a time, through `api`, which
   * must reach the server rather than a cache. Before each status change
   * the task is fetched: if its status is no longer the one the change was
   * made from, the item becomes a conflict and isn't sent. Before a comment
   * that may already have reached the server (`attempted`), the newest
   * comments are checked for it. Stops at the first item that can't reach
   * the server (no response, a 5xx, or a session that has ended), leaving
   * it queued. A refusal becomes a failed item. Conflicts and failures stay
   * for the person to see. A call while a replay runs joins it.
   */
  replay(api: ReplayApi): Promise<ReplayOutcome[]> {
    this.replaying ??= this.replayAll(api).finally(() => {
      this.replaying = null;
    });
    return this.replaying;
  }

  private async replayAll(api: ReplayApi): Promise<ReplayOutcome[]> {
    const outcomes: ReplayOutcome[] = [];
    const accountId = this.accountId;
    for (;;) {
      const item = await this.run(async () => {
        const next = this.list.find((i) => i.state === 'queued');
        if (!next || this.accountId !== accountId) {
          return undefined;
        }
        // A comment's POST may reach the server even if no answer comes
        // back, or the app is killed meanwhile.
        await this.update(
          next.id,
          next.kind === 'comment'
            ? { state: 'sending', attempted: true }
            : { state: 'sending' }
        );
        return next;
      });
      if (!item || accountId === undefined) {
        return outcomes;
      }
      let outcome: ReplayOutcome;
      try {
        outcome =
          item.kind === 'comment'
            ? await sendComment(api, item, accountId)
            : await send(api, item);
      } catch (error) {
        if (isRefusal(error)) {
          await this.run(() =>
            this.update(item.id, { state: 'failed', message: error.message })
          );
          outcomes.push({ kind: 'failed', item, error });
          continue;
        }
        await this.run(() => this.update(item.id, { state: 'queued' }));
        if (!isTransient(error) && !endsSession(error)) {
          console.error(`Sending a queued ${item.kind} failed`, error);
        }
        return outcomes;
      }
      await this.run(() => {
        if (outcome.kind === 'conflict') {
          return this.update(item.id, { state: 'conflict' });
        }
        if ('comment' in outcome && this.list.some((i) => i.id === item.id)) {
          // Before the removal below, in the same tick.
          this.commentSent(outcome.item, outcome.comment);
        }
        return this.remove(item.id);
      });
      outcomes.push(outcome);
    }
  }

  private latestStatus(taskId: string): QueuedStatusChange | undefined {
    return this.list
      .filter(
        (i): i is QueuedStatusChange =>
          i.kind === 'status' && i.taskId === taskId
      )
      .at(-1);
  }

  private newId(): string {
    return `${this.now().toString(36)}-${this.sequence++}`;
  }

  /** Changes an item still in the list (another account's is gone). */
  private async update(
    id: string,
    change: Pick<QueueItem, 'state'> & { message?: string; attempted?: boolean }
  ): Promise<void> {
    if (this.list.some((i) => i.id === id)) {
      this.list = this.list.map((i) =>
        i.id === id ? ({ ...i, ...change } as QueueItem) : i
      );
      await this.save();
    }
  }

  /** Removes an item still in the list, if it passes `when`. */
  private async remove(
    id: string,
    when: (item: QueueItem) => boolean = () => true
  ): Promise<void> {
    if (this.list.some((i) => i.id === id && when(i))) {
      this.list = this.list.filter((i) => i.id !== id);
      await this.save();
    }
  }

  /** Shows the list, then saves it. A failed save keeps it in memory. */
  private async save(): Promise<void> {
    this.changed();
    if (this.accountId === undefined) {
      return;
    }
    const name = blobName(this.accountId);
    try {
      await (this.list.length
        ? this.store.write(name, JSON.stringify({ items: this.list }))
        : this.store.remove(name));
    } catch (error) {
      console.warn('Saving the write queue failed', error);
    }
  }

  private changed(): void {
    this.listener(this.list);
  }

  /** Runs `task` after every earlier one. */
  private run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => undefined);
    return result;
  }
}

/** Fetches the task, then sends the change if it's still due. */
async function send(
  api: ReplayApi,
  item: QueuedStatusChange
): Promise<ReplayOutcome> {
  const task = await api.getTask(item.projectId, item.taskId);
  const server: QueuedStatus = normalised({
    slug: task.status ?? '',
    isClosed: task.isClosedStatus,
    resolution: task.resolution,
  });
  if (sameStatus(server, item.to)) {
    return { kind: 'already', item };
  }
  if (server.slug !== item.from.slug) {
    return { kind: 'conflict', item, task };
  }
  await api.changeTaskStatus(item.projectId, item.taskId, {
    status: item.to.slug,
    resolution: item.to.isClosed ? item.to.resolution : undefined,
  });
  return { kind: 'sent', item };
}

/**
 * Posts the comment, unless one that may already have reached the server
 * (`attempted`) is found among the newest comments.
 */
async function sendComment(
  api: ReplayApi,
  item: QueuedComment,
  accountId: string
): Promise<ReplayOutcome> {
  const posted = item.attempted
    ? await findPosted(api, item, accountId)
    : undefined;
  if (posted) {
    return { kind: 'already', item, comment: posted };
  }
  const comment = await api.addTaskComment(item.projectId, item.taskId, {
    body: item.body,
    bodyFormat: 'MARKDOWN',
    mentionedAccountIds: item.mentionedAccountIds.length
      ? item.mentionedAccountIds
      : undefined,
  });
  return { kind: 'sent', item, comment };
}

/**
 * The caller's top-level comment with the same body, created since the
 * item was queued (less some clock skew), among the newest ones. The list
 * is oldest first, so that's its last page.
 */
async function findPosted(
  api: ReplayApi,
  item: QueuedComment,
  accountId: string
): Promise<TaskComment | undefined> {
  const size = COMMENT_CHECK_PAGE_SIZE;
  let page = await api.listTaskComments(item.projectId, item.taskId, {
    page: 0,
    size,
  });
  const last = (page.totalPages ?? 1) - 1;
  if (last > 0) {
    page = await api.listTaskComments(item.projectId, item.taskId, {
      page: last,
      size,
    });
  }
  const body = item.body.trim();
  const since = item.queuedAt - POSTED_CLOCK_SKEW_MS;
  return (page.content ?? [])
    .filter(
      (c) =>
        c.authorId === accountId &&
        (c.body ?? '').trim() === body &&
        Date.parse(c.createdAt ?? '') >= since
    )
    .at(-1);
}

/** A 4xx the server means (not one that ends the session). */
function isRefusal(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    !endsSession(error)
  );
}

/** Drops a resolution an open status can't have. */
function normalised(status: QueuedStatus): QueuedStatus {
  return status.isClosed ? status : { ...status, resolution: undefined };
}

function sameStatus(a: QueuedStatus, b: QueuedStatus): boolean {
  return (
    a.slug === b.slug &&
    (a.resolution ?? undefined) === (b.resolution ?? undefined)
  );
}

function blobName(accountId: string): string {
  return `write-queue.${accountId}.json`;
}

/**
 * No items for a missing blob, or one that can't be read. Items saved
 * before comments were queued have no `kind`: they're status changes.
 */
function parseItems(data: string | undefined): QueueItem[] {
  try {
    const { items } = JSON.parse(data ?? '{}') as { items?: unknown };
    return Array.isArray(items)
      ? (items as QueueItem[]).map(
          (i) => ({ ...i, kind: i.kind ?? 'status' }) as QueueItem
        )
      : [];
  } catch {
    return [];
  }
}
