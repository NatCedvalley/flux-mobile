import type { Task, WorkflowStatus } from '../api';

export type StatusCategory = NonNullable<WorkflowStatus['category']>;

/** Category names as the status sheet's group labels show them. */
const CATEGORY_LABELS: Record<StatusCategory, string> = {
  PLANNING: 'Planning',
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
};

/**
 * A project's statuses in workflow order: the project's category order
 * (`categoryPositions`, a missing category last), then each status's
 * position. Statuses without a slug are dropped.
 */
export function workflowOrder(
  statuses: readonly WorkflowStatus[],
  categoryPositions: Readonly<Record<string, number>> = {}
): WorkflowStatus[] {
  const categoryOrder = (status: WorkflowStatus) =>
    categoryPositions[status.category ?? ''] ?? 99;
  return statuses
    .filter((status) => !!status.slug)
    .sort(
      (a, b) =>
        categoryOrder(a) - categoryOrder(b) ||
        (a.position ?? 0) - (b.position ?? 0)
    );
}

function isContainer(type: Task['type']): boolean {
  return type === 'MASTER' || type === 'EPIC';
}

/**
 * The status categories a task type may move to (the backend's
 * `TaskTypeEnum`): masters and epics are planned or done, other tasks are
 * worked on.
 */
export function allowedStatusCategories(
  type: Task['type']
): readonly StatusCategory[] {
  return isContainer(type)
    ? ['PLANNING', 'DONE']
    : ['TODO', 'IN_PROGRESS', 'DONE'];
}

/**
 * Why a task of `type` can't move to a status in `category`, or undefined
 * when it can. The category rule is the backend's only transition limit.
 */
export function blockedReason(
  type: Task['type'],
  category: WorkflowStatus['category']
): string | undefined {
  if (!category || allowedStatusCategories(type).includes(category)) {
    return undefined;
  }
  if (!isContainer(type)) {
    return 'Epics and masters only';
  }
  return type === 'MASTER' ? 'Not for masters' : 'Not for epics';
}

/**
 * The suggested next status: the first one after the task's own, in
 * workflow order (`workflowOrder`), that its type may use. Undefined at the
 * end of the workflow, or when the task's status isn't in it.
 */
export function nextStatus(
  ordered: readonly WorkflowStatus[],
  task: Pick<Task, 'status' | 'type'>
): WorkflowStatus | undefined {
  const current = ordered.findIndex((s) => s.slug === task.status);
  if (current < 0) {
    return undefined;
  }
  const allowed = allowedStatusCategories(task.type);
  return ordered
    .slice(current + 1)
    .find((s) => !!s.category && allowed.includes(s.category));
}

/**
 * What dropping a board card on a status column does: nothing on its own
 * column, refused where its type can't go, the resolution picker first for
 * a closed status, otherwise a plain move.
 */
export type DropAction = 'same' | 'blocked' | 'resolution' | 'move';

export function dropAction(
  task: Pick<Task, 'status' | 'type'>,
  status: WorkflowStatus
): DropAction {
  if (status.slug === task.status) {
    return 'same';
  }
  if (blockedReason(task.type, status.category)) {
    return 'blocked';
  }
  return status.isClosed ? 'resolution' : 'move';
}

export type StatusSheetRow = {
  status: WorkflowStatus;
  current: boolean;
  /** The next status (`nextStatus`). */
  suggested: boolean;
  /** Why the task can't move here; undefined when it can. */
  blocked: string | undefined;
  /** A closed status, which can't be chosen without a resolution. */
  needsResolution: boolean;
};

export type StatusSheetGroup = {
  category: StatusCategory;
  label: string;
  rows: StatusSheetRow[];
};

/**
 * The status sheet's rows (handoff 3h), grouped by category in workflow
 * order. Statuses the task can't use stay listed, with the reason.
 */
export function statusSheetGroups(
  ordered: readonly WorkflowStatus[],
  task: Pick<Task, 'status' | 'type'>
): StatusSheetGroup[] {
  const next = nextStatus(ordered, task);
  const groups: StatusSheetGroup[] = [];
  for (const status of ordered) {
    const category = status.category ?? 'PLANNING';
    let group = groups.at(-1);
    if (group?.category !== category) {
      group = { category, label: CATEGORY_LABELS[category], rows: [] };
      groups.push(group);
    }
    const current = status.slug === task.status;
    group.rows.push({
      status,
      current,
      suggested: status.slug === next?.slug,
      blocked: current ? undefined : blockedReason(task.type, status.category),
      needsResolution: !!status.isClosed,
    });
  }
  return groups;
}

/**
 * The task as it will be once moved to `status`, shown while the change is
 * on its way. An open status drops the resolution, as the server does.
 */
export function withStatus(
  task: Task,
  status: WorkflowStatus,
  resolution?: string
): Task {
  return {
    ...task,
    status: status.slug,
    statusCategory: status.category,
    isClosedStatus: !!status.isClosed,
    resolution: status.isClosed ? resolution : undefined,
  };
}
