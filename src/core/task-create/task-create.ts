import type { NewTask, Task, WorkflowStatus } from '../api';
import { allowedStatusCategories } from '../task-status';

export type TaskType = NonNullable<Task['type']>;

/** Every task type, in the order the type pickers list them. */
export const TASK_TYPES: readonly TaskType[] = [
  'TASK',
  'BUG',
  'FEATURE',
  'IMPROVEMENT',
  'EPIC',
  'MASTER',
];

/**
 * The types a task under a `parentType` may have (the backend's
 * `TaskTypeEnum.allowedChildTypes`): anything under a MASTER, anything but a
 * MASTER under an EPIC. Without a parent, every type.
 */
export function allowedChildTypes(
  parentType: Task['type'] | undefined
): readonly TaskType[] {
  switch (parentType) {
    case undefined:
    case 'MASTER':
      return TASK_TYPES;
    case 'EPIC':
      return TASK_TYPES.filter((type) => type !== 'MASTER');
    default:
      return [];
  }
}

/**
 * The status the server gives a new task of `type`, mirroring flux-operations'
 * `resolveDefaultStatusForType`: for a leaf type, the project's default
 * status when the type may use it; otherwise the first status by position in
 * PLANNING (masters and epics) or in TODO or IN_PROGRESS (anything else).
 * Undefined when there is none, and the server then refuses the create.
 */
export function startingStatus(
  statuses: readonly WorkflowStatus[],
  type: TaskType
): WorkflowStatus | undefined {
  const container = type === 'MASTER' || type === 'EPIC';
  if (!container) {
    const fallback = statuses.find((status) => status.isDefault);
    if (
      fallback?.category &&
      allowedStatusCategories(type).includes(fallback.category)
    ) {
      return fallback;
    }
  }
  const startable = container ? ['PLANNING'] : ['TODO', 'IN_PROGRESS'];
  return [...statuses]
    .filter((status) => !!status.slug)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .find((status) => startable.includes(status.category ?? ''));
}

/** The parent a new task goes under, as its picker found it. */
export type DraftParent = Pick<Task, 'id' | 'taskKey' | 'title' | 'type'>;

/** The create sheet's form. Only the title is required. */
export type TaskDraft = {
  projectId: string;
  type: TaskType;
  title: string;
  description: string;
  assigneeId?: string;
  priority?: NonNullable<Task['priority']>;
  dueDate?: string;
  /** Label names; their ids are looked up when they are attached. */
  labelNames: readonly string[];
  parent?: DraftParent;
};

/** A blank form in `projectId`, of the server's default type. */
export function emptyDraft(projectId: string): TaskDraft {
  return {
    projectId,
    type: 'TASK',
    title: '',
    description: '',
    labelNames: [],
  };
}

/**
 * The form moved to another project: the assignee, labels and parent belong
 * to the old one, so they go; everything else stays.
 */
export function withProject(draft: TaskDraft, projectId: string): TaskDraft {
  if (draft.projectId === projectId) {
    return draft;
  }
  return {
    ...draft,
    projectId,
    assigneeId: undefined,
    labelNames: [],
    parent: undefined,
  };
}

/** The form after a create with the sheet kept open: same project and type. */
export function afterCreate(draft: TaskDraft): TaskDraft {
  return { ...emptyDraft(draft.projectId), type: draft.type };
}

/**
 * The body of POST /projects/{p}/tasks for `draft`. Unset fields are left
 * out so the server's defaults apply (MEDIUM priority, no assignee). Labels
 * are never sent: the server only stores them on the task's own column, so
 * they are attached through the label endpoints after the create instead.
 */
export function createTaskBody(draft: TaskDraft): NewTask {
  const description = draft.description.trim();
  return {
    title: draft.title.trim(),
    type: draft.type,
    ...(description && { description, descriptionFormat: 'MARKDOWN' }),
    ...(draft.priority && { priority: draft.priority }),
    ...(draft.assigneeId && { assigneeId: draft.assigneeId }),
    ...(draft.dueDate && { dueDate: draft.dueDate }),
    ...(draft.parent && { parentTaskId: draft.parent.id }),
  };
}

/** The create sheet's callout, read as `lead` **status** `tail`. */
export type DefaultsCallout = { lead: string; status: string; tail: string };

/**
 * The callout stating what the new task starts as: `This bug will start in
 * **To Do**, unassigned.` `assignee` is the chosen assignee as the sheet
 * names them ("you", or a name), or undefined for none. The workflow's
 * assignment rules only run on a status change, never on a create, so they
 * aren't mentioned.
 */
export function defaultsCallout(
  type: TaskType,
  statusName: string,
  assignee: string | undefined
): DefaultsCallout {
  return {
    lead: `This ${type.toLowerCase()} will start in`,
    status: statusName,
    tail: assignee ? `, assigned to ${assignee}.` : ', unassigned.',
  };
}
