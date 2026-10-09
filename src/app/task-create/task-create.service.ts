import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';
import type { Label, Task } from '@core/api';
import { ApiError } from '@core/auth';
import { type TaskDraft, createTaskBody } from '@core/task-create';
import { FLUX_API } from '../providers/flux-api.token';

const CREATED_MS = 4000;
const ERROR_MS = 3000;
/** The tab bar's id: toasts sit above it once the sheet has closed. */
const TAB_BAR = 'tab-bar';

/** A task just created, and whether any of its labels failed to attach. */
export type CreatedTask = { task: Task; labelsFailed: boolean };

/**
 * The create sheet's write: the POST, then each label through the label
 * endpoints (the POST only stores label names on the task's own column),
 * then the task fetched again to carry them. Failures show the server's
 * message; success says so, with Open.
 */
@Injectable({ providedIn: 'root' })
export class TaskCreateService {
  private readonly api = inject(FLUX_API);
  private readonly toasts = inject(ToastController);

  /**
   * Creates `draft`, attaching its labels (`labels` are the project's, to
   * find their ids). On failure shows the server's message and resolves
   * undefined, so the sheet keeps what was typed.
   */
  async create(
    draft: TaskDraft,
    labels: readonly Label[]
  ): Promise<CreatedTask | undefined> {
    let task: Task;
    try {
      task = await this.api.createTask(draft.projectId, createTaskBody(draft));
    } catch (error) {
      await this.error(error);
      return undefined;
    }
    const labelIds = draft.labelNames.flatMap((name) => {
      const id = labels.find((l) => l.name === name)?.id;
      return id ? [id] : [];
    });
    if (!labelIds.length) {
      return { task, labelsFailed: draft.labelNames.length > 0 };
    }
    let labelsFailed = labelIds.length < draft.labelNames.length;
    // One at a time: each rewrites the task's label names from its own
    // transaction, so two at once can leave them stale.
    for (const id of labelIds) {
      try {
        await this.api.addTaskLabel(draft.projectId, id, task.id ?? '');
      } catch (error) {
        console.error('Adding a label to the new task failed', error);
        labelsFailed = true;
      }
    }
    try {
      task = await this.api.getTask(draft.projectId, task.id ?? '');
    } catch (error) {
      console.error('Fetching the new task failed', error);
    }
    return { task, labelsFailed };
  }

  /**
   * Says the task was created, with Open. Above the tab bar once the sheet
   * has closed; while it stays open there is no tab bar to clear.
   */
  async announce(
    { task, labelsFailed }: CreatedTask,
    sheetOpen: boolean,
    open: () => void
  ): Promise<void> {
    const key = task.taskKey ?? 'Task';
    const toast = await this.toasts.create({
      message: labelsFailed
        ? `${key} created, but some labels couldn’t be added.`
        : `${key} created`,
      duration: CREATED_MS,
      position: 'bottom',
      positionAnchor: sheetOpen ? undefined : TAB_BAR,
      buttons: [{ text: 'Open', handler: open }],
    });
    await toast.present();
  }

  private async error(error: unknown): Promise<void> {
    const toast = await this.toasts.create({
      message:
        error instanceof ApiError && error.body.message
          ? error.body.message
          : 'Couldn’t create the task',
      duration: ERROR_MS,
      position: 'bottom',
    });
    await toast.present();
  }
}
