import type { FluxApi } from './flux-api';
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
    return this.get(taskPath(projectId, taskId));
  }

  listChildTasks(projectId: string, taskId: string): Promise<Task[]> {
    return this.get(`${taskPath(projectId, taskId)}/children`);
  }

  listTaskActivities(
    projectId: string,
    taskId: string,
    query?: PageQuery
  ): Promise<Page<TaskActivity>> {
    return this.get(`${taskPath(projectId, taskId)}/activities`, query);
  }

  listTaskComments(
    projectId: string,
    taskId: string,
    query?: PageQuery
  ): Promise<Page<TaskComment>> {
    return this.get(`${taskPath(projectId, taskId)}/comments`, query);
  }

  getTaskSubscription(
    projectId: string,
    taskId: string
  ): Promise<TaskSubscription> {
    return this.get(`${taskPath(projectId, taskId)}/subscription`);
  }

  subscribeToTask(
    projectId: string,
    taskId: string
  ): Promise<TaskSubscription> {
    return this.send('POST', `${taskPath(projectId, taskId)}/subscribe`);
  }

  unsubscribeFromTask(
    projectId: string,
    taskId: string
  ): Promise<TaskSubscription> {
    return this.send('DELETE', `${taskPath(projectId, taskId)}/subscribe`);
  }

  listMyProjects(query?: MyProjectsQuery): Promise<Page<MyProject>> {
    return this.get('/projects/mine', query);
  }

  listWorkflowStatuses(projectId: string): Promise<WorkflowStatus[]> {
    return this.get(
      `/projects/${encodeURIComponent(projectId)}/workflow-statuses`
    );
  }

  listResolutions(projectId: string): Promise<TaskResolution[]> {
    return this.get(`/projects/${encodeURIComponent(projectId)}/resolutions`);
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
    return this.send(
      'PUT',
      `/projects/${encodeURIComponent(projectId)}/task-view-settings`,
      update
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

  private send<T>(
    method: 'DELETE' | 'POST' | 'PUT',
    path: string,
    body?: unknown
  ): Promise<T> {
    return this.withAccessToken((accessToken) =>
      this.http.request<T>(method, path, { accessToken, body })
    );
  }
}

function taskPath(projectId: string, taskId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`;
}
