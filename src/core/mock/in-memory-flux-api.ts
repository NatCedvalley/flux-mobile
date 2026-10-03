import type {
  AppNotification,
  FluxApi,
  MyProject,
  MyTask,
  MyTasksQuery,
  NotificationsQuery,
  Page,
  ProjectTasksQuery,
  Task,
  WorkflowStatus,
} from '../api';
import { addDays, localIsoDate } from '../my-work';

/** A fixture task: a my-tasks row that is also a full task. */
type FixtureTask = MyTask & Task & { watching?: boolean };

const PROJECTS: MyProject[] = [
  {
    project: { id: 'p1', projectKey: 'CHK', name: 'Checkout' },
    role: 'EDITOR',
    openCount: 4,
    overdueCount: 1,
  },
  {
    project: { id: 'p2', projectKey: 'BIL', name: 'Billing' },
    role: 'LEAD',
    openCount: 2,
    overdueCount: 0,
  },
];

const STATUSES: WorkflowStatus[] = [
  { slug: 'backlog', name: 'Backlog', category: 'PLANNING', position: 0 },
  { slug: 'todo', name: 'To Do', category: 'TODO', position: 1 },
  {
    slug: 'in_progress',
    name: 'In Progress',
    category: 'IN_PROGRESS',
    position: 2,
  },
  { slug: 'done', name: 'Done', category: 'DONE', position: 3 },
];

const STATUS_FIELDS = {
  backlog: {
    status: 'backlog',
    statusName: 'Backlog',
    statusCategory: 'PLANNING',
  },
  todo: { status: 'todo', statusName: 'To Do', statusCategory: 'TODO' },
  in_progress: {
    status: 'in_progress',
    statusName: 'In Progress',
    statusCategory: 'IN_PROGRESS',
  },
  done: { status: 'done', statusName: 'Done', statusCategory: 'DONE' },
} as const;

const PROJECT_FIELDS = {
  p1: { projectId: 'p1', projectKey: 'CHK', projectName: 'Checkout' },
  p2: { projectId: 'p2', projectKey: 'BIL', projectName: 'Billing' },
} as const;

/** Tasks dated relative to `today`, so My Work's sections are never empty. */
function fixtureTasks(today: string): FixtureTask[] {
  const due = (days: number) => addDays(today, days);
  return [
    {
      id: '1',
      ...PROJECT_FIELDS.p1,
      taskKey: 'CHK-142',
      title: 'Fix 3DS redirect on Safari',
      description: 'Repro only happens on expired sessions.',
      type: 'BUG',
      priority: 'CRITICAL',
      ...STATUS_FIELDS.in_progress,
      dueDate: due(-1),
    },
    {
      id: '2',
      ...PROJECT_FIELDS.p1,
      taskKey: 'CHK-150',
      title: 'Review pull request #482',
      type: 'TASK',
      priority: 'MEDIUM',
      ...STATUS_FIELDS.todo,
      dueDate: due(0),
    },
    {
      id: '3',
      ...PROJECT_FIELDS.p2,
      taskKey: 'BIL-88',
      title: 'Prorate plan upgrades',
      type: 'FEATURE',
      priority: 'HIGH',
      ...STATUS_FIELDS.todo,
      dueDate: due(3),
    },
    {
      id: '4',
      ...PROJECT_FIELDS.p1,
      taskKey: 'CHK-131',
      title: 'Speed up the order summary query',
      type: 'IMPROVEMENT',
      priority: 'LOW',
      ...STATUS_FIELDS.backlog,
      dueDate: due(5),
    },
    {
      id: '5',
      ...PROJECT_FIELDS.p2,
      taskKey: 'BIL-90',
      title: 'Write invoice export docs',
      type: 'TASK',
      priority: 'MEDIUM',
      ...STATUS_FIELDS.todo,
    },
    {
      id: '6',
      ...PROJECT_FIELDS.p1,
      taskKey: 'CHK-120',
      title: 'Migrate saved cards',
      type: 'EPIC',
      priority: 'MEDIUM',
      ...STATUS_FIELDS.done,
      dueDate: due(-10),
    },
    {
      id: '7',
      ...PROJECT_FIELDS.p2,
      taskKey: 'BIL-75',
      title: 'Dunning email copy',
      type: 'TASK',
      priority: 'MEDIUM',
      ...STATUS_FIELDS.in_progress,
      dueDate: due(2),
      watching: true,
    },
  ];
}

const NOTIFICATIONS: AppNotification[] = [
  {
    id: '1',
    title: 'Task assigned to you',
    message: "You were assigned 'Fix 3DS redirect on Safari'.",
    createdAt: '2026-09-12T09:00:00.000Z',
    isRead: false,
    entityId: '1',
  },
  {
    id: '2',
    title: 'Comment on your task',
    message: "New comment on 'Review pull request #482'.",
    createdAt: '2026-09-11T16:00:00.000Z',
    isRead: false,
    entityId: '2',
  },
  {
    id: '3',
    title: 'Task completed',
    message: "'Migrate saved cards' was marked done.",
    createdAt: '2026-09-08T17:45:00.000Z',
    isRead: true,
    entityId: '6',
  },
];

const PRIORITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

/** One page of `items`, shaped like the backend's `PagedResponse`. */
function pageOf<T>(items: T[], page = 0, size = 20): Page<T> {
  const content = items.slice(page * size, (page + 1) * size);
  const totalPages = Math.ceil(items.length / size);
  return {
    content,
    page,
    size,
    totalElements: items.length,
    totalPages,
    first: page === 0,
    last: page >= totalPages - 1,
  };
}

function notFound(projectId: string, taskId: string): Error {
  return new Error(`Task not found: ${projectId}/${taskId}`);
}

/**
 * Static in-memory `FluxApi` for tests. It applies the my-tasks filters
 * (scope, openOnly, the due window) and orders by priority then due date,
 * like the server, so pages can be tested against it.
 */
export class InMemoryFluxApi implements FluxApi {
  private readonly tasks: FixtureTask[];

  constructor(today: Date = new Date()) {
    this.tasks = fixtureTasks(localIsoDate(today));
  }

  listMyTasks(query: MyTasksQuery = {}): Promise<Page<MyTask>> {
    const watching = query.scope === 'watching';
    const rows = this.tasks
      .filter((t) => !!t.watching === watching)
      .filter((t) => query.openOnly === false || t.statusCategory !== 'DONE')
      .filter(
        (t) =>
          !query.dueDateFrom || (!!t.dueDate && t.dueDate >= query.dueDateFrom)
      )
      .filter(
        (t) => !query.dueDateTo || (!!t.dueDate && t.dueDate <= query.dueDateTo)
      )
      .filter((t) => !query.projectId || t.projectId === query.projectId)
      .sort(
        (a, b) =>
          PRIORITY_ORDER.indexOf(a.priority ?? 'LOW') -
            PRIORITY_ORDER.indexOf(b.priority ?? 'LOW') ||
          (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
      );
    return Promise.resolve(pageOf(rows, query.page, query.size));
  }

  listProjectTasks(
    projectId: string,
    query: ProjectTasksQuery = {}
  ): Promise<Page<Task>> {
    const rows = this.tasks.filter((t) => t.projectId === projectId);
    return Promise.resolve(pageOf(rows, query.page, query.size));
  }

  getTask(projectId: string, taskId: string): Promise<Task> {
    const task = this.tasks.find(
      (t) => t.projectId === projectId && t.id === taskId
    );
    return task
      ? Promise.resolve(task)
      : Promise.reject(notFound(projectId, taskId));
  }

  listMyProjects(
    query: { page?: number; size?: number } = {}
  ): Promise<Page<MyProject>> {
    return Promise.resolve(pageOf(PROJECTS, query.page, query.size));
  }

  listWorkflowStatuses(projectId: string): Promise<WorkflowStatus[]> {
    return Promise.resolve(STATUSES.map((s) => ({ ...s, projectId })));
  }

  listNotifications(
    query: NotificationsQuery = {}
  ): Promise<Page<AppNotification>> {
    const rows = NOTIFICATIONS.filter(
      (n) => query.isRead === undefined || n.isRead === query.isRead
    );
    return Promise.resolve(pageOf(rows, query.page, query.size));
  }
}
