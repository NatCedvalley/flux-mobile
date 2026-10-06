import type {
  AppNotification,
  MyProject,
  MyProjectsQuery,
  MyTask,
  MyTasksQuery,
  NotificationsQuery,
  Page,
  PageQuery,
  ProjectMember,
  ProjectTasksQuery,
  Task,
  TaskActivity,
  TaskComment,
  TaskResolution,
  TaskSubscription,
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

  /** GET /projects/{projectId}/members/assignable: unpaged, in no order. */
  listAssignableMembers(projectId: string): Promise<ProjectMember[]>;

  /** GET /notifications */
  listNotifications(query?: NotificationsQuery): Promise<Page<AppNotification>>;
};
