import {
  Component,
  computed,
  effect,
  inject,
  output,
  resource,
} from '@angular/core';
import { Clipboard } from '@capacitor/clipboard';
import {
  AlertController,
  IonButton,
  IonIcon,
  ToastController,
} from '@ionic/angular';
import type { QueueItem, QueuedStatus } from '@core/offline';
import { relativeTime } from '@core/task-detail';
import { statusPill } from '../../pages/tasks/status-pill';
import { FLUX_API } from '../../providers/flux-api.token';
import { changeCount } from '../pending-changes';
import { QueueReplayService } from '../queue-replay.service';
import { WriteQueueService } from '../write-queue.service';

/** One queued item as the sheet shows it. */
type Row = {
  item: QueueItem;
  key: string;
  change: string;
  state: string;
  tone: 'waiting' | 'conflict' | 'failed';
  age: string;
};

/**
 * Everything in the write queue, opened from the offline banner: each
 * item's task key, the change, its state and its age, with what can be done
 * about it. A queued item can be discarded; a conflict is resolved by the
 * person (Apply mine sends it from the server's status, Keep theirs drops
 * it); a refused item can be retried or discarded, and a comment's text
 * copied. Closes itself once the queue is empty.
 */
@Component({
  selector: 'app-pending-changes-sheet',
  templateUrl: './pending-changes-sheet.component.html',
  styleUrls: [
    '../../shared/sheet.scss',
    './pending-changes-sheet.component.scss',
  ],
  imports: [IonButton, IonIcon],
  host: { class: 'ion-page' },
})
export class PendingChangesSheetComponent {
  private readonly api = inject(FLUX_API);
  private readonly writeQueue = inject(WriteQueueService);
  private readonly replay = inject(QueueReplayService);
  private readonly alerts = inject(AlertController);
  private readonly toasts = inject(ToastController);

  readonly done = output();

  private readonly now = new Date();

  /** The projects with a status change, as a key the resource compares. */
  private readonly projectIds = computed(() =>
    [
      ...new Set(
        this.writeQueue
          .items()
          .filter((i) => i.kind === 'status')
          .map((i) => i.projectId)
      ),
    ]
      .sort()
      .join(',')
  );

  /** Their workflow statuses (cached), for the statuses' names. */
  private readonly statuses = resource({
    params: () => this.projectIds() || undefined,
    loader: async ({ params }) => {
      const ids = params.split(',');
      const lists = await Promise.allSettled(
        ids.map((id) => this.api.listWorkflowStatuses(id))
      );
      return new Map(
        ids.map((id, i) => {
          const list = lists[i];
          return [id, list.status === 'fulfilled' ? list.value : []];
        })
      );
    },
  });

  protected readonly rows = computed(() =>
    this.writeQueue.items().map((item) => this.row(item))
  );

  protected readonly subtitle = computed(() => {
    const attention = this.writeQueue.attention();
    return [
      changeCount(this.writeQueue.waiting()),
      attention &&
        `${attention} ${attention === 1 ? 'needs' : 'need'} attention`,
    ]
      .filter(Boolean)
      .join(' · ');
  });

  constructor() {
    effect(() => {
      if (!this.writeQueue.waiting()) {
        this.done.emit();
      }
    });
  }

  /** Sends it from the server's status. */
  protected async applyMine(item: QueueItem): Promise<void> {
    await this.writeQueue.applyMine(item.id);
    await this.replay.replay();
  }

  /** Drops the change and shows the server's copy of the task. */
  protected async keepTheirs(item: QueueItem): Promise<void> {
    await this.writeQueue.discard(item.id);
    await this.replay.refreshTask(item);
  }

  protected async retry(item: QueueItem): Promise<void> {
    await this.writeQueue.retry(item.id);
    await this.replay.replay();
  }

  /**
   * Drops the item. A comment asks first, since its text is nowhere else;
   * a status change puts the task's own status back on screen.
   */
  protected async discard(item: QueueItem): Promise<void> {
    if (item.kind === 'comment') {
      const alert = await this.alerts.create({
        header: 'Discard this comment?',
        message: `Your comment on ${key(item)} was never posted, so its text will be lost.`,
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          { text: 'Discard', role: 'destructive' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role === 'destructive') {
        await this.writeQueue.discard(item.id);
      }
      return;
    }
    await this.writeQueue.discard(item.id);
    await this.replay.refreshTask(item);
  }

  protected async copyText(item: QueueItem): Promise<void> {
    if (item.kind !== 'comment') {
      return;
    }
    try {
      await Clipboard.write({ string: item.body });
      await this.toast('Copied the comment');
    } catch (error) {
      console.error('Copying the comment failed', error);
      await this.toast('Couldn’t copy the comment');
    }
  }

  private row(item: QueueItem): Row {
    const base = {
      item,
      key: key(item),
      age: relativeTime(new Date(item.queuedAt).toISOString(), this.now),
    };
    if (item.kind === 'comment') {
      return {
        ...base,
        change: `Comment: “${item.body.trim()}”`,
        ...(item.state === 'failed'
          ? {
              state: failure('Not posted', item.message),
              tone: 'failed' as const,
            }
          : { state: waiting(item.state), tone: 'waiting' as const }),
      };
    }
    const name = (status: QueuedStatus) =>
      statusPill(
        status.slug,
        this.statuses.value()?.get(item.projectId) ?? [],
        status.category,
        status.name
      ).name;
    const change = `Move to ${name(item.to)}`;
    switch (item.state) {
      case 'conflict':
        return {
          ...base,
          change,
          state: item.current
            ? `${base.key} is now ${name(item.current)}`
            : `${base.key} changed on the server`,
          tone: 'conflict',
        };
      case 'failed':
        return {
          ...base,
          change,
          state: failure('Not sent', item.message),
          tone: 'failed',
        };
      default:
        return { ...base, change, state: waiting(item.state), tone: 'waiting' };
    }
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toasts.create({
      message,
      duration: 2000,
      position: 'bottom',
    });
    await toast.present();
  }
}

function key(item: QueueItem): string {
  return item.taskKey ?? 'A task';
}

function waiting(state: QueueItem['state']): string {
  return state === 'sending' ? 'Sending' : 'Waiting';
}

function failure(label: string, message: string | undefined): string {
  return message ? `${label} · ${message}` : label;
}
