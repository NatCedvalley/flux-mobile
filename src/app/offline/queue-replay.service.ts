import { Injectable, Injector, effect, inject, untracked } from '@angular/core';
import { App } from '@capacitor/app';
import { ToastController } from '@ionic/angular';
import type { Task } from '@core/api';
import type { QueuedStatusChange, ReplayOutcome } from '@core/offline';
import { ApiError } from '@core/auth';
import { AuthService } from '../auth/auth.service';
import { FLUX_API } from '../providers/flux-api.token';
import { NETWORK_FLUX_API } from '../providers/network-flux-api.token';
import { TaskChangesService } from '../task-status/task-changes.service';
import { ConnectivityService } from './connectivity.service';
import { WriteQueueService } from './write-queue.service';

const TAB_BAR = 'tab-bar';
const TOAST_MS = 4000;

/**
 * Sends the status changes made offline, in the foreground only: at launch,
 * on sign-in, when the connection comes back and on resume. Each one sent
 * is fetched again and reported (`TaskChangesService`), so the screens show
 * the server's copy. A change that wasn't sent (a conflict) or was refused
 * puts the server's copy back and says so in a toast.
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
    await Promise.all(outcomes.map((outcome) => this.settle(outcome)));
    await this.tell(outcomes);
  }

  /** Shows the server's copy of the task, now that its change has settled. */
  private async settle(outcome: ReplayOutcome): Promise<void> {
    const { item } = outcome;
    try {
      // Through FLUX_API, so the cache keeps the new copy too.
      this.changes.report(await this.api.getTask(item.projectId, item.taskId));
    } catch (error) {
      if (error instanceof ApiError && [403, 404].includes(error.status)) {
        this.changes.report(placeholder(item), true);
      } else if (outcome.kind === 'conflict') {
        this.changes.report(outcome.task);
      } else {
        console.error('Fetching a task after its queued change failed', error);
      }
    }
  }

  /** One toast for the changes that weren't sent, if any. */
  private async tell(outcomes: readonly ReplayOutcome[]): Promise<void> {
    const conflicts = outcomes.filter((o) => o.kind === 'conflict');
    const failures = outcomes.filter((o) => o.kind === 'failed');
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

function key(item: QueuedStatusChange): string {
  return item.taskKey ?? 'A task';
}

/** Enough of a task to take its row out. */
function placeholder(item: QueuedStatusChange): Task {
  return { id: item.taskId, projectId: item.projectId, taskKey: item.taskKey };
}
