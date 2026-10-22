import {
  Injectable,
  Injector,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  WriteQueue,
  type QueuedStatusChange,
  type StatusChangeRequest,
} from '@core/offline';
import { AuthService } from '../auth/auth.service';
import { WRITE_QUEUE_STORE } from '../providers/write-queue-store.token';

/**
 * The status changes made offline (`WriteQueue`), for the signed-in
 * account, as signals. `QueueReplayService` sends them; `CachingFluxApi`
 * shows their statuses on the tasks it reads. A sign-out keeps them for
 * when that account signs in again.
 */
@Injectable({ providedIn: 'root' })
export class WriteQueueService {
  private readonly injector = inject(Injector);
  readonly queue = new WriteQueue(inject(WRITE_QUEUE_STORE));

  private readonly list = signal<readonly QueuedStatusChange[]>([]);
  readonly items = this.list.asReadonly();

  /** Tasks with a change still to settle: the rows with the sync glyph. */
  readonly pendingTaskIds = computed<ReadonlySet<string>>(
    () =>
      new Set(
        this.list()
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
        this.list()
          .filter((i) => i.state === 'queued' || i.state === 'sending')
          .map((i) => [i.taskId, i.to.slug])
      ),
    { equal: sameEntries }
  );

  constructor() {
    this.queue.onChange((items) => this.list.set(items));
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
