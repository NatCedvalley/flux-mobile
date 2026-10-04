import type { MyProject, Task } from '../api';
import { dueFact } from '../my-work';

/** A 3b row's priority: icon, word and how loudly it's shown. */
export type PriorityFact = {
  icon: string;
  label: string;
  level: NonNullable<Task['priority']>;
};

const PRIORITY_FACTS: Record<NonNullable<Task['priority']>, PriorityFact> = {
  // "Critical", as on My Work and the web, where the handoff says "Urgent".
  CRITICAL: { icon: 'chevrons-up', label: 'Critical', level: 'CRITICAL' },
  HIGH: { icon: 'arrow-up', label: 'High', level: 'HIGH' },
  MEDIUM: { icon: 'minus', label: 'Medium', level: 'MEDIUM' },
  LOW: { icon: 'arrow-down', label: 'Low', level: 'LOW' },
};

export function priorityFact(priority: Task['priority']): PriorityFact | null {
  return priority ? PRIORITY_FACTS[priority] : null;
}

/**
 * A 3b row's due date: `Due today`, `Thu 17 Sep`, `Due yesterday` (overdue),
 * or `No due date`. A closed task is never overdue.
 */
export function projectDue(
  task: Pick<Task, 'dueDate' | 'statusCategory'>,
  today: string
): { label: string; overdue: boolean } {
  const fact = dueFact(task.dueDate, today);
  if (!fact) {
    return { label: 'No due date', overdue: false };
  }
  return task.statusCategory === 'DONE' ? { ...fact, overdue: false } : fact;
}

const ROLE_LABELS: Record<NonNullable<MyProject['role']>, string> = {
  VIEWER: 'Viewer',
  COMMENTER: 'Commenter',
  EDITOR: 'Editor',
  LEAD: 'Lead',
  MANAGER: 'Manager',
};

/** `Editor · 24 open · 2 overdue`; a viewer's reads `Viewer · read-only`. */
export function projectSubline(project: MyProject): string {
  const role = project.role ? ROLE_LABELS[project.role] : undefined;
  if (project.role === 'VIEWER') {
    return `${role} · read-only`;
  }
  const parts = [role, `${project.openCount ?? 0} open`];
  if (project.overdueCount) {
    parts.push(`${project.overdueCount} overdue`);
  }
  return parts.filter(Boolean).join(' · ');
}

/**
 * The two letters on a project's avatar: the start of its key (`CEDTE` →
 * `CE`), as in the handoff, else its name's initials.
 */
export function projectInitials(project: MyProject['project']): string {
  const key = project?.projectKey?.trim();
  if (key) {
    return key.slice(0, 2).toUpperCase();
  }
  const words = (project?.name ?? '').split(/\s+/).filter(Boolean);
  return (
    words
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase() || '?'
  );
}

/** A viewer can't change anything, so the switcher marks them with a lock. */
export function isReadOnly(project: MyProject): boolean {
  return project.role === 'VIEWER';
}

/**
 * The switcher's two groups: pinned projects, then all the others (pinned
 * ones aren't repeated), both in the server's order (by name). `search`
 * matches the name or key, ignoring case.
 */
export function switcherGroups(
  projects: readonly MyProject[],
  pinnedIds: readonly string[],
  search = ''
): { pinned: MyProject[]; others: MyProject[] } {
  const needle = search.trim().toLowerCase();
  const matches = projects.filter(
    ({ project }) =>
      !needle ||
      !!project?.name?.toLowerCase().includes(needle) ||
      !!project?.projectKey?.toLowerCase().includes(needle)
  );
  const pinned = new Set(pinnedIds);
  return {
    pinned: matches.filter((p) => pinned.has(p.project?.id ?? '')),
    others: matches.filter((p) => !pinned.has(p.project?.id ?? '')),
  };
}

/**
 * The project to open: the last one used if the user is still on it, else
 * the first pinned one, else the first of the list.
 */
export function initialProject(
  projects: readonly MyProject[],
  lastId: string | null,
  pinnedIds: readonly string[]
): MyProject | undefined {
  const byId = (id: string | null) =>
    projects.find((p) => !!id && p.project?.id === id);
  return (
    byId(lastId) ??
    pinnedIds.map(byId).find((p) => p !== undefined) ??
    projects[0]
  );
}
