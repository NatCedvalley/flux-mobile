import type { FluxApi, Task, WorkflowStatus } from '../api';
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

export type StatusChangeRequest = Pick<
  QueuedStatusChange,
  'projectId' | 'taskId' | 'taskKey' | 'from' | 'to'
>;

/** What one replayed item came to. */
export type ReplayOutcome =
  /** Sent, or the server already had it. */
  | { kind: 'sent' | 'already'; item: QueuedStatusChange }
  /** Not sent: `task` is the server's copy. */
  | { kind: 'conflict'; item: QueuedStatusChange; task: Task }
  | { kind: 'failed'; item: QueuedStatusChange; error: ApiError };

export type WriteQueueOptions = {
  now?: () => number;
};

/** The calls a replay makes, straight to the server (no cache). */
export type ReplayApi = Pick<FluxApi, 'getTask' | 'changeTaskStatus'>;

/**
 * Status changes made without a connection, in order, for one account at a
 * time, kept in a `CacheStore` (one blob per account) so they survive the
 * app being killed. Another account's changes stay saved but unseen.
 *
 * Changes to a task merge while queued (its first `from`, its last `to`),
 * and the item is dropped when it's back where it started, which is how
 * Undo cancels one. `replay` sends them one at a time, each only if the
 * task still has the status it was changed from. Every operation runs one
 * at a time, so the list and its blob stay in step.
 */
export class WriteQueue {
  private accountId: string | undefined;
  private list: QueuedStatusChange[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private replaying: Promise<ReplayOutcome[]> | null = null;
  private listener: (items: readonly QueuedStatusChange[]) => void = () =>
    undefined;
  private sequence = 0;
  private readonly now: () => number;

  constructor(
    private readonly store: CacheStore,
    options: WriteQueueOptions = {}
  ) {
    this.now = options.now ?? (() => Date.now());
  }

  get items(): readonly QueuedStatusChange[] {
    return this.list;
  }

  /** Called with the new list after every change to it. */
  onChange(listener: (items: readonly QueuedStatusChange[]) => void): void {
    this.listener = listener;
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
      const previous = this.latest(change.taskId);
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
                id: `${this.now().toString(36)}-${this.sequence++}`,
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

  /** The task's latest change still to settle: queued, sending or a conflict. */
  pending(taskId: string): QueuedStatusChange | undefined {
    const item = this.latest(taskId);
    return item?.state === 'failed' ? undefined : item;
  }

  /** The status a queued or sending change will give the task. */
  queuedStatus(taskId: string): QueuedStatus | undefined {
    const item = this.latest(taskId);
    return item?.state === 'queued' || item?.state === 'sending'
      ? item.to
      : undefined;
  }

  /**
   * Sends the queued changes in order, one at a time, through `api`, which
   * must reach the server rather than a cache. Before each one the task is
   * fetched: if its status is no longer the one the change was made from,
   * the item becomes a conflict and isn't sent. Stops at the first change
   * that can't reach the server (no response, a 5xx, or a session that has
   * ended), leaving it queued. A refusal becomes a failed item. Conflicts
   * and failures stay for the person to see. A call while a replay runs
   * joins it.
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
        await this.update(next.id, { state: 'sending' });
        return next;
      });
      if (!item) {
        return outcomes;
      }
      let outcome: ReplayOutcome;
      try {
        outcome = await send(api, item);
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
          console.error('Sending a queued status change failed', error);
        }
        return outcomes;
      }
      await this.run(() =>
        outcome.kind === 'conflict'
          ? this.update(item.id, { state: 'conflict' })
          : this.remove(item.id)
      );
      outcomes.push(outcome);
    }
  }

  private latest(taskId: string): QueuedStatusChange | undefined {
    return this.list.filter((i) => i.taskId === taskId).at(-1);
  }

  /** Changes an item still in the list (another account's is gone). */
  private async update(
    id: string,
    change: Partial<QueuedStatusChange>
  ): Promise<void> {
    if (this.list.some((i) => i.id === id)) {
      this.list = this.list.map((i) => (i.id === id ? { ...i, ...change } : i));
      await this.save();
    }
  }

  private async remove(id: string): Promise<void> {
    if (this.list.some((i) => i.id === id)) {
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

/** No items for a missing blob, or one that can't be read. */
function parseItems(data: string | undefined): QueuedStatusChange[] {
  try {
    const { items } = JSON.parse(data ?? '{}') as { items?: unknown };
    return Array.isArray(items) ? (items as QueuedStatusChange[]) : [];
  } catch {
    return [];
  }
}
