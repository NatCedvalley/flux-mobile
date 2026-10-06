import type { MyProject } from '../api';

export type ProjectRole = NonNullable<MyProject['role']>;

/** What a task screen may offer, each gated by a minimum project role. */
export type ProjectAction =
  | 'archive'
  | 'changeStatus'
  | 'comment'
  | 'create'
  | 'delete'
  | 'edit'
  | 'read'
  | 'reassign';

/** Lowest first, as the backend ranks them (`ProjectRoleEnum`). */
const ROLE_ORDER: readonly ProjectRole[] = [
  'VIEWER',
  'COMMENTER',
  'EDITOR',
  'LEAD',
  'MANAGER',
];

/** The backend's minimums (`TaskEndpoint`, `TaskCommentEndpoint`). */
const MINIMUM_ROLE: Record<ProjectAction, ProjectRole> = {
  read: 'VIEWER',
  comment: 'COMMENTER',
  edit: 'EDITOR',
  changeStatus: 'EDITOR',
  create: 'EDITOR',
  archive: 'EDITOR',
  reassign: 'LEAD',
  delete: 'LEAD',
};

/** Whether `role` may do `action`. No role (not a member) may do nothing. */
export function can(
  role: ProjectRole | undefined,
  action: ProjectAction
): boolean {
  return (
    !!role &&
    ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(MINIMUM_ROLE[action])
  );
}
