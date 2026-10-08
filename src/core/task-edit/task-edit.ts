import type { Task, TaskUpdate } from '../api';
import { isEditorJsJson } from '../rich-text';

/** The longest title the app accepts (the server's limit is 255). */
export const TITLE_MAX = 120;

/**
 * What an edit changes. These fields keep their value on the server when
 * left out, so they are only sent when they change. A due date of
 * `undefined` clears it.
 */
export type TaskChange = Partial<
  Pick<
    TaskUpdate,
    | 'description'
    | 'descriptionFormat'
    | 'dueDate'
    | 'priority'
    | 'title'
    | 'type'
  >
>;

/**
 * The body of PUT /tasks/{id} for `change`. The server clears every field
 * below that the body leaves out, so each is sent back as the task has it
 * (flux-web's calendar and detail page lose labels, versions and
 * `bugOccurredAt` that way). Labels go back as they are: they are changed
 * through the label endpoints, which a PUT doesn't keep in step.
 */
export function taskUpdateBody(task: Task, change: TaskChange): TaskUpdate {
  return {
    dueDate: task.dueDate,
    plannedStartDate: task.plannedStartDate,
    plannedEndDate: task.plannedEndDate,
    labels: task.labels,
    environment: task.environment,
    affectedVersion: task.affectedVersion,
    fixVersion: task.fixVersion,
    bugOccurredAt: task.bugOccurredAt,
    affectedUser: task.affectedUser,
    ...change,
  };
}

/** The task as it will be once `change` is saved, shown meanwhile. */
export function withChange(task: Task, change: TaskChange): Task {
  return { ...task, ...change };
}

type TaskType = NonNullable<Task['type']>;

/**
 * The types a task of `type` can be moved under (the backend's
 * `TaskTypeEnum`): a MASTER only under a MASTER, anything else under a
 * MASTER or an EPIC.
 */
export function parentTypes(type: Task['type']): TaskType[] {
  return type === 'MASTER' ? ['MASTER'] : ['MASTER', 'EPIC'];
}

/**
 * Whether the app may edit the description: it writes Markdown, so only an
 * empty or Markdown one. Older rows hold Editor.js JSON under MARKDOWN, so
 * the content is checked too.
 */
export function canEditDescription(task: Task): boolean {
  const description = task.description?.trim();
  if (!description) {
    return true;
  }
  return (
    (task.descriptionFormat ?? 'MARKDOWN') === 'MARKDOWN' &&
    !isEditorJsJson(description)
  );
}
