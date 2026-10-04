// The app's names for backend DTOs. The DTOs themselves are generated from
// the flux-operations and flux-iam OpenAPI specs into `../generated` by `npm
// run api:generate` — never hand-edit them. Call sites keep importing
// `{ Task } from '@core/api'`, so regenerating doesn't touch them.
import type {
  AccountResponse,
  AuthResponse,
  LoginRequest as IamLoginRequest,
  RefreshTokenRequest as IamRefreshTokenRequest,
} from '../generated/iam';
import type {
  GetMyTasksData,
  List2Data,
  ListMyProjectsData,
  ListTasksData,
  MyProjectResponse,
  MyTaskResponse,
  NotificationResponse,
  ProjectMemberResponse,
  TaskResponse,
  TaskViewSettingsResponse,
  UpdateTaskViewSettingsRequest,
  WorkflowStatusResponse,
} from '../generated/operations';

export type Task = TaskResponse;
/** A row of GET /dashboard/my-tasks: a task plus its project and status. */
export type MyTask = MyTaskResponse;
/** A project with the caller's role and its open and overdue counts. */
export type MyProject = MyProjectResponse;
export type WorkflowStatus = WorkflowStatusResponse;
/** A project's own task view overrides; null fields fall back. */
export type TaskViewSettings = TaskViewSettingsResponse;
/**
 * A change to the caller's own overrides: a missing field is left alone, and
 * '' clears it so the account default applies again.
 */
export type TaskViewSettingsUpdate = UpdateTaskViewSettingsRequest;
/** A project member, as the assignee pickers list them. */
export type ProjectMember = ProjectMemberResponse;
export type AppNotification = NotificationResponse;

/**
 * The backend's paged list (`PagedResponse*` in the spec). Hand-written and
 * generic because springdoc emits the list endpoints' 200 responses as
 * `unknown`.
 */
export type Page<T> = {
  content?: T[];
  page?: number;
  size?: number;
  totalElements?: number;
  totalPages?: number;
  first?: boolean;
  last?: boolean;
};

export type MyTasksQuery = Omit<
  NonNullable<GetMyTasksData['query']>,
  'scope'
> & {
  /** The server defaults to `assigned`. */
  scope?: 'assigned' | 'watching';
};
export type ProjectTasksQuery = NonNullable<ListTasksData['query']>;
export type MyProjectsQuery = NonNullable<ListMyProjectsData['query']>;
export type NotificationsQuery = NonNullable<List2Data['query']>;

export type Account = AccountResponse;
export type AuthTokens = AuthResponse;
export type LoginRequest = IamLoginRequest;
export type RefreshTokenRequest = IamRefreshTokenRequest;
