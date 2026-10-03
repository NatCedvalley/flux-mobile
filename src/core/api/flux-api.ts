import type {
  AppNotification,
  MyProject,
  MyTask,
  MyTasksQuery,
  NotificationsQuery,
  Page,
  ProjectTasksQuery,
  Task,
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

  /** GET /projects/mine: the caller's projects, role and counts. */
  listMyProjects(query?: {
    page?: number;
    size?: number;
  }): Promise<Page<MyProject>>;

  /** GET /projects/{projectId}/workflow-statuses */
  listWorkflowStatuses(projectId: string): Promise<WorkflowStatus[]>;

  /** GET /notifications */
  listNotifications(query?: NotificationsQuery): Promise<Page<AppNotification>>;
};
