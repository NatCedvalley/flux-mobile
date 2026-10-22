import {
  Injectable,
  Injector,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { TaskComment } from '@core/api';
import {
  WriteQueue,
  type CommentRequest,
  type QueueItem,
  type QueuedComment,
  type QueuedStatusChange,
  type StatusChangeRequest,
} from '@core/offline';
import { AuthService } from '../auth/auth.service';
import { WRITE_QUEUE_STORE } from '../providers/write-queue-store.token';

/** A queued comment the replay posted (or found posted): the server's copy. */
export type SentComment = {
  itemId: string;
  taskId: string;
  comment: TaskComment;
};

/**
 * The status changes and comments made offline (`WriteQueue`), for the
 * signed-in account, as signals. `QueueReplayService` sends them;
 * `CachingFluxApi` shows the queued statuses on the tasks it reads, and task
 * detail shows the comments in its thread. A sign-out keeps them for when
 * that account signs in again.
 */
@Injectable({ providedIn: 'root' })
export class WriteQueueService {
  private readonly injector = inject(Injector);
  readonly queue = new WriteQueue(inject(WRITE_QUEUE_STORE));

  private readonly list = signal<readonly QueueItem[]>([]);
  readonly items = this.list.asReadonly();

  private readonly statusChanges = computed(() =>
    this.list().filter((i): i is QueuedStatusChange => i.kind === 'status')
  );

  /**
   * Tasks with a status change still to settle: the rows with the sync
   * glyph. A queued comment shows only in the thread.
   */
  readonly pendingTaskIds = computed<ReadonlySet<string>>(
    () =>
      new Set(
        this.statusChanges()
          .filter((i) => i.state !== 'failed')
          .map((i) => i.taskId)
      )
  );

  /**
   * Each task's queued status, as reads show it. Changes only when one of
   * those does, so a list can reload to show it.
   */
  readonly queuedStatuses = computed<ReadonlyMap<string, string>>(
    () =>
      new Map(
        this.statusChanges()
          .filter((i) => i.state === 'queued' || i.state === 'sending')
          .map((i) => [i.taskId, i.to.slug])
      ),
    { equal: sameEntries }
  );

  private readonly sent = signal<SentComment | undefined>(undefined);
  /** The latest queued comment the replay posted, for a thread to show. */
  readonly sentComment = this.sent.asReadonly();

  constructor() {
    this.queue.onChange((items) => this.list.set(items));
    this.queue.onCommentSent((item, comment) =>
      this.sent.set({ itemId: item.id, taskId: item.taskId, comment })
    );
  }

  /** Runs once at startup. */
  init(): void {
    // Looked up here, not injected: the screens' specs read the queue
    // without a session behind it.
    const auth = this.injector.get(AuthService);
    // Watched only after the cold-start restore: until then, no account
    // just means not restored yet.
    void auth.restore().then(() =>
      effect(() => void this.queue.load(auth.account()?.id), {
        injector: this.injector,
      })
    );
  }

  /** Resolves with false when there's no account to queue it for. */
  enqueueStatus(change: StatusChangeRequest): Promise<boolean> {
    return this.queue.enqueueStatus(change);
  }

  /** Resolves with false when there's no account to queue it for. */
  enqueueComment(comment: CommentRequest): Promise<boolean> {
    return this.queue.enqueueComment(comment);
  }

  /** The task's comments still in the queue (queued, sending or failed), oldest first. */
  pendingComments(taskId: string): QueuedComment[] {
    return this.list().filter(
      (i): i is QueuedComment => i.kind === 'comment' && i.taskId === taskId
    );
  }

  /** Whether the task has a comment still to post. */
  commentPending(taskId: string): boolean {
    return this.queue.commentPending(taskId);
  }

  /** Removes a failed item. */
  discard(id: string): Promise<void> {
    return this.queue.discard(id);
  }

  /** Forgets the task's conflicts and failures, after a newer change landed. */
  dropUnsent(taskId: string): Promise<void> {
    return this.queue.dropUnsent(taskId);
  }

  /** The task's change still to settle: queued, sending or a conflict. */
  pending(taskId: string): QueuedStatusChange | undefined {
    return this.queue.pending(taskId);
  }
}

function sameEntries(
  a: ReadonlyMap<string, string>,
  b: ReadonlyMap<string, string>
): boolean {
  return (
    a.size === b.size && [...a].every(([key, value]) => b.get(key) === value)
  );
}
