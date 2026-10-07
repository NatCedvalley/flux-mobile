import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';
import type { Task, WorkflowStatus } from '@core/api';
import { ApiError } from '@core/auth';
import { withStatus } from '@core/task-status';
import { FLUX_API } from '../providers/flux-api.token';
import { TaskChangesService } from './task-changes.service';

/** How long Undo is offered (handoff: a 4 s toast). */
const UNDO_MS = 4000;
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
 */
@Injectable({ providedIn: 'root' })
export class TaskStatusService {
  private readonly api = inject(FLUX_API);
  private readonly toasts = inject(ToastController);
  private readonly changes = inject(TaskChangesService);
  private undoToast: HTMLIonToastElement | undefined;

  /**
   * Moves `task` to `to`, with a resolution when `to` is closed. Resolves
   * with whether the server took it. `undoable` is false for the Undo itself.
   */
  async move(
    task: Task,
    to: WorkflowStatus,
    resolution: string | undefined,
    view: TaskView,
    undoable = true
  ): Promise<boolean> {
    const projectId = task.projectId ?? '';
    const taskId = task.id ?? '';
    view.apply(withStatus(task, to, resolution));
    try {
      await this.api.changeTaskStatus(projectId, taskId, {
        status: to.slug ?? '',
        resolution: to.isClosed ? resolution : undefined,
      });
    } catch (error) {
      view.apply(task);
      await this.error(error, 'Couldn’t change the status', view.anchor);
      return false;
    }
    const fresh = await this.refetch(projectId, taskId);
    if (fresh) {
      view.apply(fresh);
      this.changes.report(fresh);
    }
    if (undoable) {
      // The task as it was, as a status to move back to.
      const previous: WorkflowStatus = {
        slug: task.status,
        category: task.statusCategory,
        isClosed: task.isClosedStatus,
      };
      const moved = fresh ?? withStatus(task, to, resolution);
      await this.offerUndo(`Moved to ${to.name ?? to.slug}`, view.anchor, () =>
        this.move(moved, previous, task.resolution, view, false)
      );
    }
    return true;
  }

  /**
   * Archives `task` and its subtasks, which must all be done. Resolves with
   * whether the server took it.
   */
  async archive(task: Task, view: ArchiveView): Promise<boolean> {
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
    await this.offerUndo(
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

  /** A toast with Undo, replacing any Undo still on screen. */
  private async offerUndo(
    message: string,
    anchor: HTMLElement | string | undefined,
    undo: () => Promise<unknown>
  ): Promise<void> {
    void this.undoToast?.dismiss();
    const toast = await this.toasts.create({
      message,
      duration: UNDO_MS,
      position: 'bottom',
      positionAnchor: anchor,
      buttons: [{ text: 'Undo', handler: () => void undo() }],
    });
    this.undoToast = toast;
    await toast.present();
  }

  private async error(
    error: unknown,
    fallback: string,
    anchor: HTMLElement | string | undefined
  ): Promise<void> {
    void this.undoToast?.dismiss();
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
