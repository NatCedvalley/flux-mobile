import type { FluxApi } from './flux-api';
import type {
  AppNotification,
  MyProject,
  MyProjectsQuery,
  MyTask,
  MyTasksQuery,
  NotificationsQuery,
  Page,
  ProjectMember,
  ProjectTasksQuery,
  Task,
  TaskViewSettings,
  TaskViewSettingsUpdate,
  WorkflowStatus,
} from './types';
import { type FetchFn, JsonHttpClient, type QueryParams } from '../http';

/**
 * Runs `call` with a live access token: `AuthSession.withAccessToken`, which
 * refreshes and retries once on a bare 401 and ends the session when the
 * server says it is over.
 */
export type WithAccessToken = <T>(
  call: (accessToken: string) => Promise<T>
) => Promise<T>;

/**
 * `FluxApi` over flux-operations. `baseUrl` is the environment's `apiBaseUrl`
 * (ending in `/api/v1`). Failures are `ApiError`s (see `JsonHttpClient`).
 */
export class HttpFluxApi implements FluxApi {
  private readonly http: JsonHttpClient;

  constructor(
    baseUrl: string,
    private readonly withAccessToken: WithAccessToken,
    fetchFn?: FetchFn,
    timeoutMs?: number
  ) {
    this.http = new JsonHttpClient(baseUrl, fetchFn, timeoutMs);
  }

  listMyTasks(query?: MyTasksQuery): Promise<Page<MyTask>> {
    return this.get('/dashboard/my-tasks', query);
  }

  listProjectTasks(
    projectId: string,
    query?: ProjectTasksQuery
  ): Promise<Page<Task>> {
    return this.get(`/projects/${encodeURIComponent(projectId)}/tasks`, query);
  }

  getTask(projectId: string, taskId: string): Promise<Task> {
    return this.get(
      `/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`
    );
  }

  listMyProjects(query?: MyProjectsQuery): Promise<Page<MyProject>> {
    return this.get('/projects/mine', query);
  }

  listWorkflowStatuses(projectId: string): Promise<WorkflowStatus[]> {
    return this.get(
      `/projects/${encodeURIComponent(projectId)}/workflow-statuses`
    );
  }

  getTaskViewSettings(projectId: string): Promise<TaskViewSettings> {
    return this.get(
      `/projects/${encodeURIComponent(projectId)}/task-view-settings`
    );
  }

  updateTaskViewSettings(
    projectId: string,
    update: TaskViewSettingsUpdate
  ): Promise<TaskViewSettings> {
    return this.withAccessToken((accessToken) =>
      this.http.request<TaskViewSettings>(
        'PUT',
        `/projects/${encodeURIComponent(projectId)}/task-view-settings`,
        { accessToken, body: update }
      )
    );
  }

  listAssignableMembers(projectId: string): Promise<ProjectMember[]> {
    return this.get(
      `/projects/${encodeURIComponent(projectId)}/members/assignable`
    );
  }

  listNotifications(
    query?: NotificationsQuery
  ): Promise<Page<AppNotification>> {
    return this.get('/notifications', query);
  }

  private get<T>(path: string, query?: QueryParams): Promise<T> {
    return this.withAccessToken((accessToken) =>
      this.http.request<T>('GET', path, { accessToken, query })
    );
  }
}
