import { Injectable, Injector, effect, inject, untracked } from '@angular/core';
import { App } from '@capacitor/app';
import { ToastController } from '@ionic/angular';
import type { Task } from '@core/api';
import type { QueueItem, ReplayOutcome } from '@core/offline';
import { ApiError } from '@core/auth';
import { localIsoDate, myWorkQueries } from '@core/my-work';
import { AuthService } from '../auth/auth.service';
import { FLUX_API } from '../providers/flux-api.token';
import { NETWORK_FLUX_API } from '../providers/network-flux-api.token';
import { TaskChangesService } from '../task-status/task-changes.service';
import { ConnectivityService } from './connectivity.service';
import { WriteQueueService } from './write-queue.service';

const TAB_BAR = 'tab-bar';
const TOAST_MS = 4000;

/**
 * Sends the status changes and comments made offline, in the foreground
 * only: at launch, on sign-in, when the connection comes back and on
 * resume. Each task whose status change settled is fetched again and
 * reported (`TaskChangesService`), so the screens show the server's copy.
 * A change that wasn't sent (a conflict) or was refused puts the server's
 * copy back and says so in a toast. My Work's cached lists are fetched
 * again too, since My Work may be hidden meanwhile and would otherwise
 * reload its old rows from the cache once offline. A posted comment reaches
 * task detail through `WriteQueueService.sentComment`; a refused one stays
 * in the thread as failed, and the toast says so.
 */
@Injectable({ providedIn: 'root' })
export class QueueReplayService {
  private readonly api = inject(FLUX_API);
  private readonly network = inject(NETWORK_FLUX_API);
  private readonly auth = inject(AuthService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly writeQueue = inject(WriteQueueService);
  private readonly changes = inject(TaskChangesService);
  private readonly toasts = inject(ToastController);
  private readonly injector = inject(Injector);

  /** Runs once at startup. */
  init(): void {
    void App.addListener('resume', () => void this.replay());
    void this.auth.restore().then(() =>
      effect(
        () => {
          const id = this.auth.account()?.id;
          const online = this.connectivity.online();
          untracked(() => {
            if (id && online) {
              void this.replay();
            }
          });
        },
        { injector: this.injector }
      )
    );
  }

  /** Sends what's queued, if signed in and online. */
  async replay(): Promise<void> {
    const accountId = this.auth.account()?.id;
    if (!accountId || !this.connectivity.online()) {
      return;
    }
    const { queue } = this.writeQueue;
    await queue.load(accountId);
    const outcomes = await queue.replay(this.network);
    // A comment changes neither its task nor My Work.
    const statuses = outcomes.filter((o) => o.item.kind === 'status');
    await Promise.all(statuses.map((outcome) => this.settle(outcome)));
    if (statuses.length) {
      void this.refreshMyWork();
    }
    await this.tell(outcomes);
  }

  /** Fetches My Work's lists through FLUX_API, which caches them. */
  private async refreshMyWork(): Promise<void> {
    const queries = myWorkQueries(localIsoDate(new Date()));
    await Promise.allSettled(
      Object.values(queries).map((query) => this.api.listMyTasks(query))
    );
  }

  /** Shows the server's copy of the task, now that its change has settled. */
  private settle(outcome: ReplayOutcome): Promise<void> {
    return this.refreshTask(
      outcome.item,
      outcome.kind === 'conflict' ? outcome.task : undefined
    );
  }

  /**
   * Shows the server's copy of the item's task, once its change has settled
   * or been given up (offline, the cached copy), else `fallback` if given.
   */
  async refreshTask(item: QueueItem, fallback?: Task): Promise<void> {
    try {
      // Through FLUX_API, so the cache keeps the new copy too.
      this.changes.report(await this.api.getTask(item.projectId, item.taskId));
    } catch (error) {
      if (error instanceof ApiError && [403, 404].includes(error.status)) {
        this.changes.report(placeholder(item), true);
      } else if (fallback) {
        this.changes.report(fallback);
      } else {
        console.error('Fetching a task after its queued change failed', error);
      }
    }
  }

  /** One toast for the changes that weren't sent, if any. */
  private async tell(outcomes: readonly ReplayOutcome[]): Promise<void> {
    const conflicts = outcomes.filter((o) => o.kind === 'conflict');
    const failures = outcomes.filter(
      (o) => o.kind === 'failed' && o.item.kind === 'status'
    );
    const unposted = outcomes.filter(
      (o) => o.kind === 'failed' && o.item.kind === 'comment'
    );
    const lines = [
      conflicts.length === 1
        ? `${key(conflicts[0].item)} changed on the server, so your status change wasn’t sent.`
        : conflicts.length > 1
          ? `${conflicts.length} status changes weren’t sent: their tasks changed on the server.`
          : '',
      failures.length === 1 && failures[0].kind === 'failed'
        ? `Couldn’t move ${key(failures[0].item)}: ${failures[0].error.message}`
        : failures.length > 1
          ? `${failures.length} status changes couldn’t be sent.`
          : '',
      unposted.length === 1 && unposted[0].kind === 'failed'
        ? `Couldn’t post your comment on ${key(unposted[0].item)}: ${unposted[0].error.message}`
        : unposted.length > 1
          ? `${unposted.length} comments couldn’t be posted.`
          : '',
    ].filter(Boolean);
    if (!lines.length) {
      return;
    }
    const toast = await this.toasts.create({
      message: lines.join(' '),
      duration: TOAST_MS,
      position: 'bottom',
      positionAnchor: TAB_BAR,
    });
    await toast.present();
  }
}

function key(item: QueueItem): string {
  return item.taskKey ?? 'A task';
}

/** Enough of a task to take its row out. */
function placeholder(item: QueueItem): Task {
  return { id: item.taskId, projectId: item.projectId, taskKey: item.taskKey };
}
