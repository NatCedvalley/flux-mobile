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
  AssignTaskRequest,
  ChangeTaskStatusRequest,
  CommentReactionResponse,
  CreateTaskCommentRequest,
  CreateTaskRequest,
  GetMyTasksData,
  LabelResponse,
  List2Data,
  ListCommentsData,
  ListMyProjectsData,
  ListTasksData,
  MyProjectResponse,
  MyTaskResponse,
  NotificationResponse,
  ProjectMemberResponse,
  TaskActivityResponse,
  TaskCommentResponse,
  TaskResolutionResponse,
  TaskResponse,
  TaskViewSettingsResponse,
  UnarchiveTaskRequest,
  UpdateTaskCommentRequest,
  UpdateTaskRequest,
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
/** One entry of a task's activity timeline. */
export type TaskActivity = TaskActivityResponse;
/** A top-level comment carries its replies in `replies`. */
export type TaskComment = TaskCommentResponse;
/**
 * One emoji's reactions on a comment. `emoji` is a key the web maps to a
 * glyph (`thumbs_up`, …; see `@core/comments`), not the glyph itself.
 */
export type CommentReaction = CommentReactionResponse;
/**
 * A new comment. `mentionedAccountIds` only drives the mention
 * notifications: the server doesn't read mentions from the body.
 */
export type NewTaskComment = CreateTaskCommentRequest;
/** An edited comment. The server ignores `mentionedAccountIds` here. */
export type TaskCommentUpdate = UpdateTaskCommentRequest;
export type TaskResolution = TaskResolutionResponse;
/**
 * A status change: the status's slug, and a resolution's slug when (and
 * only when) the status is closed.
 */
export type TaskStatusChange = ChangeTaskStatusRequest;
/** Restoring an archived task: `reason` is required. */
export type TaskUnarchive = UnarchiveTaskRequest;
/**
 * The body of PUT /tasks/{id}, which replaces the task: a missing title,
 * description, type, priority or format keeps its value, but every other
 * missing field is cleared. Build it with `taskUpdateBody` (`@core/task-edit`).
 */
export type TaskUpdate = UpdateTaskRequest;
/**
 * The body of POST /projects/{p}/tasks: only the title is required, and the
 * server picks the starting status. Build it with `createTaskBody`
 * (`@core/task-create`).
 */
export type NewTask = CreateTaskRequest;
/** A project's label. Tasks carry label names; the label endpoints take ids. */
export type Label = LabelResponse;
/** Assigning a task: the whole list of assignees, replacing the old one. */
export type TaskAssign = AssignTaskRequest;
/**
 * Moving a task under another one, or to the root with null. Hand-written:
 * the spec's type doesn't allow the null.
 */
export type TaskParentChange = { parentTaskId: string | null };
/**
 * Whether the caller gets the task's activity notifications. Hand-written:
 * the spec types the body as a map of booleans without naming the key.
 */
export type TaskSubscription = { subscribed?: boolean };

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
/** `page` and `size` alone, as the comments and activities lists take. */
export type PageQuery = NonNullable<ListCommentsData['query']>;

export type Account = AccountResponse;
export type AuthTokens = AuthResponse;
export type LoginRequest = IamLoginRequest;
export type RefreshTokenRequest = IamRefreshTokenRequest;
