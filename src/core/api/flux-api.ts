import type {
  AppNotification,
  CommentReaction,
  Label,
  MyProject,
  MyProjectsQuery,
  MyTask,
  MyTasksQuery,
  NewTaskComment,
  NotificationsQuery,
  Page,
  PageQuery,
  ProjectMember,
  ProjectTasksQuery,
  Task,
  TaskActivity,
  TaskAssign,
  TaskComment,
  TaskCommentUpdate,
  TaskParentChange,
  TaskResolution,
  TaskStatusChange,
  TaskSubscription,
  TaskUnarchive,
  TaskUpdate,
  TaskViewSettings,
  TaskViewSettingsUpdate,
  WorkflowStatus,
} from './types';

/**
 * Thin, framework-agnostic interface over flux-operations. Promise-based
 * (not rxjs) so a later Flutter or native implementation can satisfy it too.
 * `HttpFluxApi` is the real one; `InMemoryFluxApi` serves tests.
 *
 * Paths below are relative to the environment's `apiBaseUrl` (`…/api/v1`).
 * Pages are zero-based, and the server clamps `size` to 1..100.
 */
export type FluxApi = {
  /** GET /dashboard/my-tasks: the caller's tasks across every project. */
  listMyTasks(query?: MyTasksQuery): Promise<Page<MyTask>>;

  /** GET /projects/{projectId}/tasks */
  listProjectTasks(
    projectId: string,
    query?: ProjectTasksQuery
  ): Promise<Page<Task>>;

  /** GET /projects/{projectId}/tasks/{taskId}: tasks are project-scoped. */
  getTask(projectId: string, taskId: string): Promise<Task>;

  /**
   * PUT /projects/{projectId}/tasks/{taskId}: replaces the task, clearing
   * the fields `update` leaves out (see `TaskUpdate`). The response has no
   * assignees, so fetch the task again rather than using it.
   */
  updateTask(
    projectId: string,
    taskId: string,
    update: TaskUpdate
  ): Promise<Task>;

  /**
   * PATCH /projects/{projectId}/tasks/{taskId}/parent: moves the task under
   * a MASTER or EPIC, or to the root.
   */
  changeTaskParent(
    projectId: string,
    taskId: string,
    change: TaskParentChange
  ): Promise<Task>;

  /**
   * PATCH /projects/{projectId}/tasks/{taskId}/assign: replaces every
   * assignee (LEAD and above).
   */
  assignTask(
    projectId: string,
    taskId: string,
    assign: TaskAssign
  ): Promise<Task>;

  /** DELETE /projects/{projectId}/tasks/{taskId}: a soft delete (LEAD+). */
  deleteTask(projectId: string, taskId: string): Promise<void>;

  /**
   * PATCH /projects/{projectId}/tasks/{taskId}/status. The response leaves
   * out assignees, the parent and other joined fields, so fetch the task
   * again rather than using it.
   */
  changeTaskStatus(
    projectId: string,
    taskId: string,
    change: TaskStatusChange
  ): Promise<Task>;

  /**
   * POST /projects/{projectId}/tasks/{taskId}/archive: archives the task and
   * its subtasks, which must all be in a DONE-category status.
   */
  archiveTask(projectId: string, taskId: string): Promise<Task>;

  /** POST /projects/{projectId}/tasks/{taskId}/unarchive */
  unarchiveTask(
    projectId: string,
    taskId: string,
    request: TaskUnarchive
  ): Promise<Task>;

  /** GET /projects/{projectId}/tasks/{taskId}/children: unpaged. */
  listChildTasks(projectId: string, taskId: string): Promise<Task[]>;

  /** GET /projects/{projectId}/tasks/{taskId}/activities: newest first. */
  listTaskActivities(
    projectId: string,
    taskId: string,
    query?: PageQuery
  ): Promise<Page<TaskActivity>>;

  /**
   * GET /projects/{projectId}/tasks/{taskId}/comments: oldest first. Pages
   * count top-level comments, each with all of its replies nested.
   */
  listTaskComments(
    projectId: string,
    taskId: string,
    query?: PageQuery
  ): Promise<Page<TaskComment>>;

  /**
   * POST /projects/{projectId}/tasks/{taskId}/comments (COMMENTER+). The
   * response has no reactions or replies.
   */
  addTaskComment(
    projectId: string,
    taskId: string,
    comment: NewTaskComment
  ): Promise<TaskComment>;

  /**
   * PUT /projects/{projectId}/tasks/{taskId}/comments/{commentId}: the
   * author only. The response has no reactions or replies.
   */
  updateTaskComment(
    projectId: string,
    taskId: string,
    commentId: string,
    update: TaskCommentUpdate
  ): Promise<TaskComment>;

  /**
   * DELETE /projects/{projectId}/tasks/{taskId}/comments/{commentId}: the
   * author only, and refused while the comment has replies.
   */
  deleteTaskComment(
    projectId: string,
    taskId: string,
    commentId: string
  ): Promise<void>;

  /**
   * POST /projects/{projectId}/tasks/{taskId}/comments/{commentId}/reactions:
   * adds the caller's `emoji` reaction, or removes it if they have it.
   * Returns the comment's reactions.
   */
  toggleCommentReaction(
    projectId: string,
    taskId: string,
    commentId: string,
    emoji: string
  ): Promise<CommentReaction[]>;

  /** GET /projects/{projectId}/tasks/{taskId}/subscription */
  getTaskSubscription(
    projectId: string,
    taskId: string
  ): Promise<TaskSubscription>;

  /** POST /projects/{projectId}/tasks/{taskId}/subscribe */
  subscribeToTask(projectId: string, taskId: string): Promise<TaskSubscription>;

  /**
   * DELETE /projects/{projectId}/tasks/{taskId}/subscribe: sticky, so the
   * server won't subscribe the caller again on later activity.
   */
  unsubscribeFromTask(
    projectId: string,
    taskId: string
  ): Promise<TaskSubscription>;

  /**
   * GET /projects/mine: the caller's projects, role and counts. `tz` (an
   * IANA zone) decides which day "overdue" is counted from.
   */
  listMyProjects(query?: MyProjectsQuery): Promise<Page<MyProject>>;

  /** GET /projects/{projectId}/workflow-statuses */
  listWorkflowStatuses(projectId: string): Promise<WorkflowStatus[]>;

  /** GET /projects/{projectId}/resolutions: the project's resolutions. */
  listResolutions(projectId: string): Promise<TaskResolution[]>;

  /**
   * GET /projects/{projectId}/task-view-settings: the project's own task
   * view overrides (group-by, AI filter, …), each null when not overridden.
   */
  getTaskViewSettings(projectId: string): Promise<TaskViewSettings>;

  /**
   * PUT /projects/{projectId}/task-view-settings: changes the caller's own
   * overrides for the project (flux-web writes the same ones).
   */
  updateTaskViewSettings(
    projectId: string,
    update: TaskViewSettingsUpdate
  ): Promise<TaskViewSettings>;

  /** GET /projects/{projectId}/labels: unpaged, by name. */
  listLabels(projectId: string): Promise<Label[]>;

  /**
   * POST /projects/{projectId}/labels/{labelId}/tasks/{taskId}: adds the
   * label to the task (and to its `labels` names).
   */
  addTaskLabel(
    projectId: string,
    labelId: string,
    taskId: string
  ): Promise<void>;

  /** DELETE /projects/{projectId}/labels/{labelId}/tasks/{taskId} */
  removeTaskLabel(
    projectId: string,
    labelId: string,
    taskId: string
  ): Promise<void>;

  /** GET /projects/{projectId}/members/assignable: unpaged, in no order. */
  listAssignableMembers(projectId: string): Promise<ProjectMember[]>;

  /** GET /notifications */
  listNotifications(query?: NotificationsQuery): Promise<Page<AppNotification>>;
};
