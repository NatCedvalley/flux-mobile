import type {
  AppNotification,
  Attachment,
  CommentReaction,
  DeviceRegistration,
  FluxApi,
  Label,
  MarkedAllRead,
  MyProject,
  MyProjectsQuery,
  MyTask,
  MyTasksQuery,
  NewTask,
  NewTaskComment,
  NotificationsQuery,
  Page,
  PageQuery,
  ProjectMember,
  ProjectTasksQuery,
  PushPreference,
  Task,
  TaskActivity,
  TaskAssign,
  TaskComment,
  TaskCommentUpdate,
  TaskParentChange,
  TaskReorder,
  TaskResolution,
  TaskStatusChange,
  TaskSubscription,
  TaskUnarchive,
  TaskUpdate,
  TaskViewSettings,
  TaskViewSettingsUpdate,
  UnreadCount,
  WorkflowStatus,
} from '../api';
import type { ResponseCache } from './response-cache';
import type { QueuedStatus } from './write-queue';
import { ApiError } from '../auth/api-error';
import { withStatus } from '../task-status/status-rules';
import { cacheKey } from './cache-key';

export type CachingFluxApiOptions = {
  /** The signed-in account; nothing is cached without one. */
  accountId: () => string | undefined;
  /** False while the device has no connection. */
  online: () => boolean;
  /** The status a change still waiting to be sent gives a task, if any. */
  queuedStatus?: (taskId: string) => QueuedStatus | undefined;
};

/**
 * `FluxApi` that keeps the reads `cacheKey()` allows in a `ResponseCache`,
 * and serves them back when the backend can't be reached. A cache, not
 * offline-first: only responses already fetched are served, never queried
 * or merged.
 *
 * - Online, every read goes to `inner`. A success is saved; an `ApiError`
 *   with status 0 (no response) is answered from the cache if it can be,
 *   and any other error is the caller's.
 * - Offline, no read touches the network (which would only fail, after the
 *   token refresh's backoff): it is the saved copy or an `ApiError(0)`.
 * - Writes always go straight to `inner`.
 *
 * Tasks it reads, from either, show the status of a change still queued
 * for them (`queuedStatus`), so they match what the person did offline.
 */
export class CachingFluxApi implements FluxApi {
  constructor(
    private readonly inner: FluxApi,
    private readonly cache: ResponseCache,
    private readonly options: CachingFluxApiOptions
  ) {}

  async listMyTasks(query?: MyTasksQuery): Promise<Page<MyTask>> {
    const page = await this.read('listMyTasks', query);
    return { ...page, content: page.content?.map((t) => this.queuedMine(t)) };
  }

  async listProjectTasks(
    projectId: string,
    query?: ProjectTasksQuery
  ): Promise<Page<Task>> {
    const page = await this.read('listProjectTasks', projectId, query);
    return { ...page, content: page.content?.map((t) => this.queued(t)) };
  }

  async getTask(projectId: string, taskId: string): Promise<Task> {
    return this.queued(await this.read('getTask', projectId, taskId));
  }

  createTask(projectId: string, task: NewTask): Promise<Task> {
    return this.inner.createTask(projectId, task);
  }

  updateTask(
    projectId: string,
    taskId: string,
    update: TaskUpdate
  ): Promise<Task> {
    return this.inner.updateTask(projectId, taskId, update);
  }

  changeTaskParent(
    projectId: string,
    taskId: string,
    change: TaskParentChange
  ): Promise<Task> {
    return this.inner.changeTaskParent(projectId, taskId, change);
  }

  assignTask(
    projectId: string,
    taskId: string,
    assign: TaskAssign
  ): Promise<Task> {
    return this.inner.assignTask(projectId, taskId, assign);
  }

  deleteTask(projectId: string, taskId: string): Promise<void> {
    return this.inner.deleteTask(projectId, taskId);
  }

  changeTaskStatus(
    projectId: string,
    taskId: string,
    change: TaskStatusChange
  ): Promise<Task> {
    return this.inner.changeTaskStatus(projectId, taskId, change);
  }

  reorderTasks(projectId: string, reorder: TaskReorder): Promise<Task[]> {
    return this.inner.reorderTasks(projectId, reorder);
  }

  archiveTask(projectId: string, taskId: string): Promise<Task> {
    return this.inner.archiveTask(projectId, taskId);
  }

  unarchiveTask(
    projectId: string,
    taskId: string,
    request: TaskUnarchive
  ): Promise<Task> {
    return this.inner.unarchiveTask(projectId, taskId, request);
  }

  async listChildTasks(projectId: string, taskId: string): Promise<Task[]> {
    const tasks = await this.read('listChildTasks', projectId, taskId);
    return tasks.map((t) => this.queued(t));
  }

  listTaskActivities(
    projectId: string,
    taskId: string,
    query?: PageQuery
  ): Promise<Page<TaskActivity>> {
    return this.read('listTaskActivities', projectId, taskId, query);
  }

  listTaskComments(
    projectId: string,
    taskId: string,
    query?: PageQuery
  ): Promise<Page<TaskComment>> {
    return this.read('listTaskComments', projectId, taskId, query);
  }

  addTaskComment(
    projectId: string,
    taskId: string,
    comment: NewTaskComment
  ): Promise<TaskComment> {
    return this.inner.addTaskComment(projectId, taskId, comment);
  }

  updateTaskComment(
    projectId: string,
    taskId: string,
    commentId: string,
    update: TaskCommentUpdate
  ): Promise<TaskComment> {
    return this.inner.updateTaskComment(projectId, taskId, commentId, update);
  }

  deleteTaskComment(
    projectId: string,
    taskId: string,
    commentId: string
  ): Promise<void> {
    return this.inner.deleteTaskComment(projectId, taskId, commentId);
  }

  toggleCommentReaction(
    projectId: string,
    taskId: string,
    commentId: string,
    emoji: string
  ): Promise<CommentReaction[]> {
    return this.inner.toggleCommentReaction(
      projectId,
      taskId,
      commentId,
      emoji
    );
  }

  listTaskAttachments(
    projectId: string,
    taskId: string
  ): Promise<Attachment[]> {
    return this.read('listTaskAttachments', projectId, taskId);
  }

  uploadTaskAttachment(
    projectId: string,
    taskId: string,
    file: Blob,
    fileName: string
  ): Promise<Attachment> {
    return this.inner.uploadTaskAttachment(projectId, taskId, file, fileName);
  }

  getTaskSubscription(
    projectId: string,
    taskId: string
  ): Promise<TaskSubscription> {
    return this.read('getTaskSubscription', projectId, taskId);
  }

  subscribeToTask(
    projectId: string,
    taskId: string
  ): Promise<TaskSubscription> {
    return this.inner.subscribeToTask(projectId, taskId);
  }

  unsubscribeFromTask(
    projectId: string,
    taskId: string
  ): Promise<TaskSubscription> {
    return this.inner.unsubscribeFromTask(projectId, taskId);
  }

  listMyProjects(query?: MyProjectsQuery): Promise<Page<MyProject>> {
    return this.read('listMyProjects', query);
  }

  listWorkflowStatuses(projectId: string): Promise<WorkflowStatus[]> {
    return this.read('listWorkflowStatuses', projectId);
  }

  listResolutions(projectId: string): Promise<TaskResolution[]> {
    return this.read('listResolutions', projectId);
  }

  getTaskViewSettings(projectId: string): Promise<TaskViewSettings> {
    return this.read('getTaskViewSettings', projectId);
  }

  updateTaskViewSettings(
    projectId: string,
    update: TaskViewSettingsUpdate
  ): Promise<TaskViewSettings> {
    return this.inner.updateTaskViewSettings(projectId, update);
  }

  listLabels(projectId: string): Promise<Label[]> {
    return this.read('listLabels', projectId);
  }

  addTaskLabel(
    projectId: string,
    labelId: string,
    taskId: string
  ): Promise<void> {
    return this.inner.addTaskLabel(projectId, labelId, taskId);
  }

  removeTaskLabel(
    projectId: string,
    labelId: string,
    taskId: string
  ): Promise<void> {
    return this.inner.removeTaskLabel(projectId, labelId, taskId);
  }

  listAssignableMembers(projectId: string): Promise<ProjectMember[]> {
    return this.read('listAssignableMembers', projectId);
  }

  listNotifications(
    query?: NotificationsQuery
  ): Promise<Page<AppNotification>> {
    return this.read('listNotifications', query);
  }

  notificationUnreadCount(type?: string): Promise<UnreadCount> {
    return this.read('notificationUnreadCount', type);
  }

  markNotificationRead(id: string): Promise<AppNotification> {
    return this.inner.markNotificationRead(id);
  }

  markAllNotificationsRead(): Promise<MarkedAllRead> {
    return this.inner.markAllNotificationsRead();
  }

  registerDevice(device: DeviceRegistration): Promise<void> {
    return this.inner.registerDevice(device);
  }

  unregisterDevice(token: string): Promise<void> {
    return this.inner.unregisterDevice(token);
  }

  pushPreferences(): Promise<PushPreference[]> {
    return this.read('pushPreferences');
  }

  updatePushPreferences(
    preferences: PushPreference[]
  ): Promise<PushPreference[]> {
    return this.inner.updatePushPreferences(preferences);
  }

  /** `task` with its queued status, if it has one. */
  private queued(task: Task): Task {
    const status = task.id ? this.options.queuedStatus?.(task.id) : undefined;
    return status ? withStatus(task, status, status.resolution) : task;
  }

  /** The same for a My Work row, which also shows the status by name. */
  private queuedMine(task: MyTask): MyTask {
    const status = task.id ? this.options.queuedStatus?.(task.id) : undefined;
    return status
      ? {
          ...task,
          status: status.slug,
          statusName: status.name,
          statusCategory: status.category,
        }
      : task;
  }

  private async read<Method extends keyof FluxApi>(
    method: Method,
    ...args: Parameters<FluxApi[Method]>
  ): Promise<Awaited<ReturnType<FluxApi[Method]>>> {
    type Value = Awaited<ReturnType<FluxApi[Method]>>;
    const key = cacheKey(method, args);
    const accountId = key === null ? undefined : this.options.accountId();
    const saved = async (): Promise<Value | undefined> =>
      key !== null && accountId !== undefined
        ? this.cache.get<Value>(accountId, key)
        : undefined;

    if (!this.options.online()) {
      const value = await saved();
      if (value === undefined) {
        throw new ApiError(0);
      }
      return value;
    }
    let value: Value;
    try {
      const call = this.inner[method] as (...args: unknown[]) => Promise<Value>;
      value = await call.apply(this.inner, args);
    } catch (error) {
      const fallback =
        error instanceof ApiError && error.status === 0
          ? await saved()
          : undefined;
      if (fallback === undefined) {
        throw error;
      }
      return fallback;
    }
    if (key !== null && accountId !== undefined) {
      void this.cache.put(accountId, key, value);
    }
    return value;
  }
}
