import type { Task } from '../api';

/**
 * Rows per request on the board, the server's cap. A column is loaded whole,
 * because its order is sorted here: the server can't sort by position.
 */
export const BOARD_PAGE_SIZE = 100;

/**
 * flux-web's board order: position, then newest first. A missing position
 * counts as 0, the backend's default.
 */
function compare(a: Task, b: Task): number {
  return (
    (a.position ?? 0) - (b.position ?? 0) ||
    (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
  );
}

/** A column's tasks in board order. Ties keep their order. */
export function boardOrder(tasks: readonly Task[]): Task[] {
  return [...tasks].sort(compare);
}

/**
 * Where `task` goes in a column already in board order: before the first
 * other task that sorts after it, counted in the column without it.
 */
export function boardIndex(tasks: readonly Task[], task: Task): number {
  const others = tasks.filter((t) => t.id !== task.id);
  const index = others.findIndex((t) => compare(task, t) < 0);
  return index < 0 ? others.length : index;
}

/**
 * A column's ids with `taskId` put at `index`, counted in the column without
 * it. A task from another column is added there.
 */
export function movedOrder(
  ids: readonly string[],
  taskId: string,
  index: number
): string[] {
  const others = ids.filter((id) => id !== taskId);
  const at = Math.min(Math.max(index, 0), others.length);
  return [...others.slice(0, at), taskId, ...others.slice(at)];
}
