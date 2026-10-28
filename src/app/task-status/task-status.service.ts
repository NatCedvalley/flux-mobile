import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';
import type { Task, WorkflowStatus } from '@core/api';
import type { QueuedStatus } from '@core/offline';
import { ApiError } from '@core/auth';
import { withStatus } from '@core/task-status';
import { AnalyticsService } from '../analytics/analytics.service';
import { ConnectivityService } from '../offline/connectivity.service';
import {
  OFFLINE_MESSAGES,
  OfflineToastService,
} from '../offline/offline-toast.service';
import { WriteQueueService } from '../offline/write-queue.service';
import { FLUX_API } from '../providers/flux-api.token';
import { TaskChangesService } from './task-changes.service';
import { UndoToastService } from './undo-toast.service';

const ERROR_MS = 3000;
/** `reason` is required to unarchive; this one says what happened. */
const UNDO_ARCHIVE_REASON = 'Archive undone in Flux Mobile';

/** Where a screen shows a task while a change is on its way. */
export type TaskView = {
  /** Shows the task as given: the change, the server's copy, or the original. */
  apply(task: Task): void;
  /** What the toasts sit above (the tab bar's id, a docked bar). */
  anchor?: HTMLElement | string;
};

/**
 * What became of a status change: the server took it, it waits in the write
 * queue for a connection, or it was refused (and put back).
 */
export type MoveOutcome = 'sent' | 'queued' | 'refused';

/** Where a list shows an archived task, and shows it again on Undo. */
export type ArchiveView = {
  removed(): void;
  restored(task: Task): void;
  anchor?: HTMLElement | string;
};

/**
 * Status changes and archiving, shared by task detail and the Projects list.
 * A change shows at once and offers Undo for 4 s; if the server refuses, the
 * task is put back and the server's message shown. On success the task is
 * fetched again, because the response leaves out assignees and other joined
 * fields (and a status's assignment rule can change the assignees).
 *
 * Without a connection a status change goes in the write queue instead,
 * and stays on screen until `QueueReplayService` sends it.
 */
@Injectable({ providedIn: 'root' })
export class TaskStatusService {
  private readonly api = inject(FLUX_API);
  private readonly toasts = inject(ToastController);
  private readonly changes = inject(TaskChangesService);
  private readonly undo = inject(UndoToastService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly writeQueue = inject(WriteQueueService);
  private readonly offlineToast = inject(OfflineToastService);
  private readonly analytics = inject(AnalyticsService);

  /**
   * Moves `task` to `to`, with a resolution when `to` is closed. Offline, or
   * when the request gets no response, the change is queued rather than put
   * back; so is any change to a task whose earlier change is still queued,
   * which keeps them in order (and lets Undo cancel a queued one). `undoable`
   * is false for the Undo itself.
   */
  async move(
    task: Task,
    to: WorkflowStatus,
    resolution: string | undefined,
    view: TaskView,
    undoable = true
  ): Promise<MoveOutcome> {
    const projectId = task.projectId ?? '';
    const taskId = task.id ?? '';
    const moved = withStatus(task, to, resolution);
    view.apply(moved);
    const waiting = this.writeQueue.pending(taskId)?.state;
    let queue =
      !this.connectivity.online() ||
      waiting === 'queued' ||
      waiting === 'sending';
    if (!queue) {
      try {
        await this.api.changeTaskStatus(projectId, taskId, {
          status: to.slug ?? '',
          resolution: to.isClosed ? resolution : undefined,
        });
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 0)) {
          view.apply(task);
          await this.error(error, 'Couldn’t change the status', view.anchor);
          return 'refused';
        }
        queue = true;
      }
    }
    if (queue) {
      return this.enqueue(task, to, resolution, view, undoable);
    }
    // An earlier conflict or failure is moot now, and would keep the glyph.
    void this.writeQueue.dropUnsent(taskId);
    this.logged('sent', to, undoable);
    const fresh = await this.refetch(projectId, taskId);
    if (fresh) {
      view.apply(fresh);
      this.changes.report(fresh);
    }
    if (undoable) {
      await this.offerUndo(task, fresh ?? moved, to, view);
    }
    return 'sent';
  }

  /** Queues the change shown on `view`, or puts the task back if it can't. */
  private async enqueue(
    task: Task,
    to: WorkflowStatus,
    resolution: string | undefined,
    view: TaskView,
    undoable: boolean
  ): Promise<MoveOutcome> {
    const queued = await this.writeQueue.enqueueStatus({
      projectId: task.projectId ?? '',
      taskId: task.id ?? '',
      taskKey: task.taskKey,
      from: {
        slug: task.status ?? '',
        category: task.statusCategory,
        isClosed: task.isClosedStatus,
        resolution: task.resolution,
      },
      to: queuedStatus(to, resolution),
    });
    if (!queued) {
      // No account to queue it for (a session from before accounts were kept).
      view.apply(task);
      await this.error(undefined, 'Couldn’t change the status', view.anchor);
      return 'refused';
    }
    // Not fetched again: offline, that would be the saved copy from before.
    const moved = withStatus(task, to, resolution);
    this.changes.report(moved);
    this.logged('queued', to, undoable);
    if (undoable) {
      await this.offerUndo(task, moved, to, view);
    }
    return 'queued';
  }

  /** Counts a change the person made; an Undo (not `undoable`) isn't one. */
  private logged(
    outcome: 'sent' | 'queued',
    to: WorkflowStatus,
    undoable: boolean
  ): void {
    if (undoable) {
      void this.analytics.log({
        name: 'status_change',
        params: { outcome, category: to.category },
      });
    }
  }

  /** Offers to move `moved` back to the status `task` had. */
  private offerUndo(
    task: Task,
    moved: Task,
    to: WorkflowStatus,
    view: TaskView
  ): Promise<void> {
    // The task as it was, as a status to move back to.
    const previous: WorkflowStatus = {
      slug: task.status,
      category: task.statusCategory,
      isClosed: task.isClosedStatus,
    };
    return this.undo.offer(`Moved to ${to.name ?? to.slug}`, view.anchor, () =>
      this.move(moved, previous, task.resolution, view, false)
    );
  }

  /**
   * Archives `task` and its subtasks, which must all be done. Resolves with
   * whether the server took it. Offline it isn't tried.
   */
  async archive(task: Task, view: ArchiveView): Promise<boolean> {
    if (!this.connectivity.online()) {
      await this.offlineToast.show(OFFLINE_MESSAGES.archive, view.anchor);
      return false;
    }
    const projectId = task.projectId ?? '';
    const taskId = task.id ?? '';
    view.removed();
    try {
      await this.api.archiveTask(projectId, taskId);
    } catch (error) {
      view.restored(task);
      await this.error(error, 'Couldn’t archive the task', view.anchor);
      return false;
    }
    await this.undo.offer(
      `Archived ${task.taskKey ?? 'the task'}`,
      view.anchor,
      () => this.unarchive(task, view)
    );
    return true;
  }

  private async unarchive(task: Task, view: ArchiveView): Promise<void> {
    const projectId = task.projectId ?? '';
    const taskId = task.id ?? '';
    try {
      await this.api.unarchiveTask(projectId, taskId, {
        reason: UNDO_ARCHIVE_REASON,
      });
    } catch (error) {
      await this.error(error, 'Couldn’t restore the task', view.anchor);
      return;
    }
    view.restored((await this.refetch(projectId, taskId)) ?? task);
  }

  /** The task from the server, or undefined if that fails (keep what's shown). */
  private async refetch(
    projectId: string,
    taskId: string
  ): Promise<Task | undefined> {
    try {
      return await this.api.getTask(projectId, taskId);
    } catch (error) {
      console.error('Fetching the changed task failed', error);
      return undefined;
    }
  }

  private async error(
    error: unknown,
    fallback: string,
    anchor: HTMLElement | string | undefined
  ): Promise<void> {
    this.undo.dismiss();
    const toast = await this.toasts.create({
      message:
        error instanceof ApiError && error.body.message
          ? error.body.message
          : fallback,
      duration: ERROR_MS,
      position: 'bottom',
      positionAnchor: anchor,
    });
    await toast.present();
  }
}

/** `to` as the write queue keeps it. */
function queuedStatus(
  to: WorkflowStatus,
  resolution: string | undefined
): QueuedStatus {
  return {
    slug: to.slug ?? '',
    name: to.name,
    category: to.category,
    isClosed: to.isClosed,
    resolution: to.isClosed ? resolution : undefined,
  };
}
