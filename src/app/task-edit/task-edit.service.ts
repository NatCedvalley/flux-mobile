import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';
import type { Label, ProjectMember, Task } from '@core/api';
import { ApiError } from '@core/auth';
import { type TaskChange, taskUpdateBody, withChange } from '@core/task-edit';
import type { TaskView } from '../task-status/task-status.service';
import { FLUX_API } from '../providers/flux-api.token';
import { TaskChangesService } from '../task-status/task-changes.service';

const ERROR_MS = 3000;

/**
 * Field edits from task detail: the PUT (built so it keeps every field it
 * doesn't change), labels, the parent and the assignees, and deleting. Each
 * change shows at once; if the server refuses, the task is put back and the
 * server's message shown. On success the task is fetched again, because the
 * responses leave out assignees and joined fields, and reported so a list
 * further back shows the change.
 */
@Injectable({ providedIn: 'root' })
export class TaskEditService {
  private readonly api = inject(FLUX_API);
  private readonly toasts = inject(ToastController);
  private readonly changes = inject(TaskChangesService);

  /** Saves `change` with PUT /tasks/{id}. Resolves with whether it was taken. */
  update(task: Task, change: TaskChange, view: TaskView): Promise<boolean> {
    return this.write(
      task,
      withChange(task, change),
      view,
      'Couldn’t save the change',
      (projectId, taskId) =>
        this.api.updateTask(projectId, taskId, taskUpdateBody(task, change))
    );
  }

  /**
   * Adds and removes labels through the label endpoints (a PUT doesn't keep
   * the server's label links in step), one at a time: each rewrites the
   * task's `labels` names from its own transaction, so two at once can leave
   * them stale. Some may land before one fails, so a failure shows the
   * server's copy rather than the original.
   */
  async setLabels(
    task: Task,
    add: readonly Label[],
    remove: readonly Label[],
    view: TaskView
  ): Promise<boolean> {
    const removed = new Set(remove.map((l) => l.name));
    const labels = [
      ...(task.labels ?? []).filter((name) => !removed.has(name)),
      ...add.map((l) => l.name ?? ''),
    ];
    const ok = await this.write(
      task,
      { ...task, labels },
      view,
      'Couldn’t change the labels',
      async (projectId, taskId) => {
        for (const l of add) {
          await this.api.addTaskLabel(projectId, l.id ?? '', taskId);
        }
        for (const l of remove) {
          await this.api.removeTaskLabel(projectId, l.id ?? '', taskId);
        }
      }
    );
    if (!ok) {
      await this.refresh(task, view);
    }
    return ok;
  }

  /** Moves the task under `parent`, or to the root with null. */
  setParent(task: Task, parent: Task | null, view: TaskView): Promise<boolean> {
    return this.write(
      task,
      {
        ...task,
        parentTaskId: parent?.id,
        parentTask: parent
          ? {
              id: parent.id,
              taskKey: parent.taskKey,
              title: parent.title,
              status: parent.status,
            }
          : undefined,
      },
      view,
      'Couldn’t change the parent',
      (projectId, taskId) =>
        this.api.changeTaskParent(projectId, taskId, {
          parentTaskId: parent?.id ?? null,
        })
    );
  }

  /** Replaces every assignee with `members`. */
  assign(
    task: Task,
    members: readonly ProjectMember[],
    view: TaskView
  ): Promise<boolean> {
    return this.write(
      task,
      {
        ...task,
        assigneeId: members[0]?.accountId,
        assignees: members.map((m) => ({
          accountId: m.accountId,
          firstName: m.firstName,
          lastName: m.lastName,
        })),
      },
      view,
      'Couldn’t reassign the task',
      (projectId, taskId) =>
        this.api.assignTask(projectId, taskId, {
          assigneeIds: members.map((m) => m.accountId ?? ''),
        })
    );
  }

  /** Deletes the task. Resolves with whether the server took it. */
  async delete(task: Task, anchor?: HTMLElement | string): Promise<boolean> {
    try {
      await this.api.deleteTask(task.projectId ?? '', task.id ?? '');
    } catch (error) {
      await this.error(error, 'Couldn’t delete the task', anchor);
      return false;
    }
    this.changes.report(task, true);
    return true;
  }

  private async write(
    task: Task,
    shown: Task,
    view: TaskView,
    fallback: string,
    send: (projectId: string, taskId: string) => Promise<unknown>
  ): Promise<boolean> {
    view.apply(shown);
    try {
      await send(task.projectId ?? '', task.id ?? '');
    } catch (error) {
      view.apply(task);
      await this.error(error, fallback, view.anchor);
      return false;
    }
    await this.refresh(task, view);
    return true;
  }

  /** Shows and reports the server's copy, keeping what's shown on failure. */
  private async refresh(task: Task, view: TaskView): Promise<void> {
    try {
      const fresh = await this.api.getTask(task.projectId ?? '', task.id ?? '');
      view.apply(fresh);
      this.changes.report(fresh);
    } catch (error) {
      console.error('Fetching the changed task failed', error);
    }
  }

  private async error(
    error: unknown,
    fallback: string,
    anchor: HTMLElement | string | undefined
  ): Promise<void> {
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
