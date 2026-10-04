import type {
  AppNotification,
  FluxApi,
  MyProject,
  MyProjectsQuery,
  MyTask,
  MyTasksQuery,
  NotificationsQuery,
  Page,
  ProjectMember,
  PageQuery,
  ProjectTasksQuery,
  Task,
  TaskActivity,
  TaskComment,
  TaskResolution,
  TaskSubscription,
  TaskViewSettings,
  TaskViewSettingsUpdate,
  WorkflowStatus,
} from '../api';
import { addDays, localIsoDate } from '../my-work';

/**
 * A fixture task: a my-tasks row that is also a full task. `notMine` keeps it
 * off My Work (someone else's task in one of the user's projects).
 */
type FixtureTask = MyTask & Task & { watching?: boolean; notMine?: boolean };

const CATEGORY_POSITIONS = { PLANNING: 0, TODO: 1, IN_PROGRESS: 2, DONE: 3 };

const PROJECTS: MyProject[] = [
  {
    project: {
      id: 'p1',
      projectKey: 'CHK',
      name: 'Checkout',
      categoryPositions: CATEGORY_POSITIONS,
    },
    role: 'EDITOR',
    openCount: 4,
    overdueCount: 1,
  },
  {
    project: {
      id: 'p2',
      projectKey: 'BIL',
      name: 'Billing',
      categoryPositions: CATEGORY_POSITIONS,
    },
    role: 'LEAD',
    openCount: 2,
    overdueCount: 0,
  },
];

const STATUSES: WorkflowStatus[] = [
  {
    id: 's0',
    slug: 'backlog',
    name: 'Backlog',
    category: 'PLANNING',
    color: 'neutral',
    position: 0,
  },
  {
    id: 's1',
    slug: 'todo',
    name: 'To Do',
    category: 'TODO',
    color: 'blue',
    position: 1,
  },
  {
    id: 's2',
    slug: 'in_progress',
    name: 'In Progress',
    category: 'IN_PROGRESS',
    color: 'amber',
    position: 2,
  },
  {
    id: 's3',
    slug: 'done',
    name: 'Done',
    category: 'DONE',
    color: 'green',
    position: 3,
  },
];

const ADA = { accountId: 'a1', firstName: 'Ada', lastName: 'Rahman' };
const BEN = { accountId: 'a2', firstName: 'Ben', lastName: 'Tan' };

/** Every project's assignable members, in no particular order. */
const MEMBERS: ProjectMember[] = [
  { ...BEN, email: 'ben@flux.test', role: 'EDITOR' },
  { ...ADA, email: 'ada@flux.test', role: 'EDITOR' },
  {
    accountId: 'a3',
    firstName: 'Chen',
    lastName: 'Wei',
    email: 'chen@flux.test',
    role: 'LEAD',
  },
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
      description: [
        'Repro only happens on **expired sessions**: Safari drops the 3DS',
        'return URL and the shopper lands on an empty cart.',
        '',
        '1. Sign in and add any item',
        '2. Wait for the session to expire',
        '3. Pay with a 3DS test card',
        '',
        'The fix probably belongs in `ReturnUrlFilter`.',
      ].join('\n'),
      descriptionFormat: 'MARKDOWN',
      type: 'BUG',
      priority: 'CRITICAL',
      ...STATUS_FIELDS.in_progress,
      dueDate: due(-1),
      assignees: [ADA],
      reporterId: BEN.accountId,
      reporterFirstName: BEN.firstName,
      reporterLastName: BEN.lastName,
      labels: ['safari', 'payments', '3ds'],
      linkedReleases: [
        { id: 'r1', versionTag: 'v2.4.0', title: 'Payments', status: 'NEW' },
      ],
      parentTaskId: '6',
      parentTask: {
        id: '6',
        taskKey: 'CHK-120',
        title: 'Migrate saved cards',
        status: 'done',
      },
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
      assignees: [ADA],
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
      assignees: [BEN],
      parentTaskId: '6',
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
      childCount: 2,
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
    {
      id: '8',
      ...PROJECT_FIELDS.p1,
      taskKey: 'CHK-160',
      title: 'Draft: add Apple Pay',
      type: 'FEATURE',
      priority: 'MEDIUM',
      ...STATUS_FIELDS.todo,
      labels: ['ai:candidate'],
      notMine: true,
    },
  ];
}

/** `daysAgo` days before `now`, at `hh:mm` local time. */
function at(now: Date, daysAgo: number, hh: number, mm: number): string {
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hh, mm, 0, 0);
  return date.toISOString();
}

/** Comments by task id: top-level ones oldest first, replies nested. */
function fixtureComments(now: Date): Record<string, TaskComment[]> {
  return {
    '1': [
      {
        id: 'c1',
        taskId: '1',
        authorId: BEN.accountId,
        authorFirstName: BEN.firstName,
        authorLastName: BEN.lastName,
        body: 'Seen on iOS 18 too. The redirect drops `returnUrl`.',
        bodyFormat: 'MARKDOWN',
        createdAt: at(now, 2, 10, 4),
        reactions: [
          { emoji: '👍', count: 2, reactedByMe: true },
          { emoji: '👀', count: 1, reactedByMe: false },
        ],
        replies: [
          {
            id: 'c2',
            taskId: '1',
            parentCommentId: 'c1',
            authorId: ADA.accountId,
            authorFirstName: ADA.firstName,
            authorLastName: ADA.lastName,
            body: 'Thanks, I can reproduce it now.',
            bodyFormat: 'MARKDOWN',
            createdAt: at(now, 2, 11, 30),
          },
        ],
      },
      {
        id: 'c3',
        taskId: '1',
        authorId: ADA.accountId,
        authorFirstName: ADA.firstName,
        authorLastName: ADA.lastName,
        body: JSON.stringify({
          blocks: [
            {
              type: 'paragraph',
              data: {
                text: '<span class="editorjs-mention" data-account-id="a2">@Ben Tan</span> the fix is up for review.',
              },
            },
          ],
        }),
        bodyFormat: 'EDITORJS',
        edited: true,
        createdAt: at(now, 0, 8, 12),
      },
    ],
  };
}

/** Activity by task id, newest first. */
function fixtureActivities(now: Date): Record<string, TaskActivity[]> {
  const entry = (
    id: string,
    action: TaskActivity['action'],
    createdAt: string,
    fields: Partial<TaskActivity> = {}
  ): TaskActivity => ({
    id,
    taskId: '1',
    projectId: 'p1',
    actorId: ADA.accountId,
    actorName: 'Ada Rahman',
    action,
    createdAt,
    ...fields,
  });
  return {
    '1': [
      entry('e5', 'COMMENT_ADDED', at(now, 0, 8, 12)),
      entry('e4', 'STATUS_CHANGED', at(now, 0, 8, 2), {
        field: 'status',
        oldValue: 'todo',
        newValue: 'in_progress',
      }),
      entry('e3', 'FIELD_UPDATED', at(now, 1, 16, 40), {
        field: 'priority',
        oldValue: 'HIGH',
        newValue: 'CRITICAL',
      }),
      entry('e2', 'ASSIGNED', at(now, 1, 9, 15), {
        actorName: 'Ben Tan',
        field: 'assignee',
        newValue: `[${ADA.accountId}]`,
        newValueDisplay: 'Ada Rahman',
      }),
      entry('e1', 'CREATED', at(now, 1, 9, 0), { actorName: 'Ben Tan' }),
    ],
  };
}

const RESOLUTIONS: TaskResolution[] = [
  { id: 'res1', name: 'Done', slug: 'done', position: 0 },
  { id: 'res2', name: 'Won’t do', slug: 'wont-do', position: 1 },
  { id: 'res3', name: 'Duplicate', slug: 'duplicate', position: 2 },
];

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

/** A comma-separated filter as its values; empty when it isn't set. */
function csv(value: string | undefined): string[] {
  return value ? value.split(',').map((v) => v.trim()) : [];
}

/** Matches the title or the task key, case-insensitively, like the server. */
function matchesSearch(task: FixtureTask, search: string | undefined) {
  const term = search?.trim().toLowerCase();
  return (
    !term ||
    !!task.title?.toLowerCase().includes(term) ||
    !!task.taskKey?.toLowerCase().includes(term)
  );
}

/** Sort keys for `field,dir`; a missing value sorts last either way. */
const SORT_KEYS: Record<
  string,
  (t: FixtureTask) => number | string | undefined
> = {
  dueDate: (t) => t.dueDate,
  priority: (t) =>
    t.priority ? 3 - PRIORITY_ORDER.indexOf(t.priority) : undefined,
  title: (t) => t.title?.toLowerCase(),
  taskNumber: (t) => Number(t.taskKey?.split('-')[1]),
  updatedAt: (t) => t.updatedAt,
  createdAt: (t) => t.createdAt,
};

function sortTasks(rows: FixtureTask[], sort: string | undefined) {
  const [field, dir] = (sort ?? '').split(',');
  const key = SORT_KEYS[field];
  if (!key) {
    return rows;
  }
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x === undefined || y === undefined) {
      return x === y ? 0 : x === undefined ? 1 : -1;
    }
    return x < y ? -sign : x > y ? sign : 0;
  });
}

/** Whether `value` is one of a comma-separated filter's values (or no filter). */
function inList(value: string | undefined, filter: string | undefined) {
  const values = csv(filter);
  return !values.length || values.includes(value ?? '');
}

function notFound(projectId: string, taskId: string): Error {
  return new Error(`Task not found: ${projectId}/${taskId}`);
}

/**
 * Static in-memory `FluxApi` for tests. It applies the my-tasks filters
 * (scope, openOnly, the due window, project, status, priority, search) and
 * orders by priority then due date, like the server, and the project task
 * list's filters (comma lists for status, priority, type and assignee,
 * labels, search) and sort, so pages can be tested against it. Tasks
 * without a sort value (fixtures have no createdAt) keep their order.
 */
export class InMemoryFluxApi implements FluxApi {
  private readonly tasks: FixtureTask[];
  private readonly viewSettings = new Map<string, TaskViewSettings>();
  private readonly comments: Record<string, TaskComment[]>;
  private readonly activities: Record<string, TaskActivity[]>;
  /** Task ids the caller is subscribed to: the watched ones to start with. */
  private readonly subscribed: Set<string>;

  constructor(today: Date = new Date()) {
    this.tasks = fixtureTasks(localIsoDate(today));
    this.comments = fixtureComments(today);
    this.activities = fixtureActivities(today);
    this.subscribed = new Set(
      this.tasks.filter((t) => t.watching).map((t) => t.id ?? '')
    );
  }

  /**
   * Adds `count` someone-else's tasks to a project, in `status`, numbered
   * from `<key>-1000`: enough rows to page through.
   */
  addProjectTasks(projectId: 'p1' | 'p2', count: number, status = 'todo') {
    const fields = PROJECT_FIELDS[projectId];
    const statusFields = STATUS_FIELDS[status as keyof typeof STATUS_FIELDS];
    for (let i = 0; i < count; i++) {
      this.tasks.push({
        id: `${projectId}-extra-${status}-${i}`,
        ...fields,
        taskKey: `${fields.projectKey}-${1000 + i}`,
        title: `Extra task ${i + 1}`,
        type: 'TASK',
        priority: 'MEDIUM',
        ...statusFields,
        notMine: true,
      });
    }
    return this;
  }

  /** Sets a project's task view overrides (none by default). */
  setTaskViewSettings(projectId: string, settings: TaskViewSettings) {
    this.viewSettings.set(projectId, settings);
    return this;
  }

  listMyTasks(query: MyTasksQuery = {}): Promise<Page<MyTask>> {
    const watching = query.scope === 'watching';
    const rows = this.tasks
      .filter((t) => !t.notMine)
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
      .filter((t) => inList(t.status, query.status))
      .filter((t) => inList(t.priority, query.priority))
      .filter((t) => matchesSearch(t, query.search))
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
    const assignees = csv(query.assigneeId);
    const rows = this.tasks
      .filter((t) => t.projectId === projectId)
      .filter((t) => inList(t.status, query.status))
      .filter((t) => inList(t.priority, query.priority))
      .filter((t) => inList(t.type, query.type))
      .filter(
        (t) =>
          !assignees.length ||
          !!t.assignees?.some((a) => assignees.includes(a.accountId ?? ''))
      )
      .filter(
        (t) => !query.excludeLabel || !t.labels?.includes(query.excludeLabel)
      )
      .filter(
        (t) => !query.requireLabel || !!t.labels?.includes(query.requireLabel)
      )
      .filter((t) => matchesSearch(t, query.search));
    return Promise.resolve(
      pageOf(sortTasks(rows, query.sort), query.page, query.size)
    );
  }

  getTask(projectId: string, taskId: string): Promise<Task> {
    const task = this.tasks.find(
      (t) => t.projectId === projectId && t.id === taskId
    );
    return task
      ? Promise.resolve(task)
      : Promise.reject(notFound(projectId, taskId));
  }

  listChildTasks(projectId: string, taskId: string): Promise<Task[]> {
    return this.withTask(projectId, taskId, () =>
      this.tasks.filter(
        (t) => t.projectId === projectId && t.parentTaskId === taskId
      )
    );
  }

  listTaskActivities(
    projectId: string,
    taskId: string,
    query: PageQuery = {}
  ): Promise<Page<TaskActivity>> {
    return this.withTask(projectId, taskId, () =>
      pageOf(this.activities[taskId] ?? [], query.page, query.size)
    );
  }

  listTaskComments(
    projectId: string,
    taskId: string,
    query: PageQuery = {}
  ): Promise<Page<TaskComment>> {
    return this.withTask(projectId, taskId, () =>
      pageOf(this.comments[taskId] ?? [], query.page, query.size)
    );
  }

  getTaskSubscription(
    projectId: string,
    taskId: string
  ): Promise<TaskSubscription> {
    return this.withTask(projectId, taskId, () => ({
      subscribed: this.subscribed.has(taskId),
    }));
  }

  subscribeToTask(
    projectId: string,
    taskId: string
  ): Promise<TaskSubscription> {
    return this.withTask(projectId, taskId, () => {
      this.subscribed.add(taskId);
      return { subscribed: true };
    });
  }

  unsubscribeFromTask(
    projectId: string,
    taskId: string
  ): Promise<TaskSubscription> {
    return this.withTask(projectId, taskId, () => {
      this.subscribed.delete(taskId);
      return { subscribed: false };
    });
  }

  listMyProjects(query: MyProjectsQuery = {}): Promise<Page<MyProject>> {
    return Promise.resolve(pageOf(PROJECTS, query.page, query.size));
  }

  listWorkflowStatuses(projectId: string): Promise<WorkflowStatus[]> {
    return Promise.resolve(STATUSES.map((s) => ({ ...s, projectId })));
  }

  listResolutions(projectId: string): Promise<TaskResolution[]> {
    return Promise.resolve(RESOLUTIONS.map((r) => ({ ...r, projectId })));
  }

  getTaskViewSettings(projectId: string): Promise<TaskViewSettings> {
    return Promise.resolve(this.viewSettings.get(projectId) ?? {});
  }

  updateTaskViewSettings(
    projectId: string,
    update: TaskViewSettingsUpdate
  ): Promise<TaskViewSettings> {
    const settings: TaskViewSettings = {
      ...this.viewSettings.get(projectId),
    };
    for (const [key, value] of Object.entries(update)) {
      if (value !== undefined) {
        settings[key as keyof TaskViewSettings] = value || undefined;
      }
    }
    this.viewSettings.set(projectId, settings);
    return Promise.resolve(settings);
  }

  listAssignableMembers(projectId: string): Promise<ProjectMember[]> {
    return Promise.resolve(MEMBERS.map((m) => ({ ...m, projectId })));
  }

  listNotifications(
    query: NotificationsQuery = {}
  ): Promise<Page<AppNotification>> {
    const rows = NOTIFICATIONS.filter(
      (n) => query.isRead === undefined || n.isRead === query.isRead
    );
    return Promise.resolve(pageOf(rows, query.page, query.size));
  }

  /** `result()` for an existing task, else the not-found rejection. */
  private withTask<T>(
    projectId: string,
    taskId: string,
    result: () => T
  ): Promise<T> {
    const exists = this.tasks.some(
      (t) => t.projectId === projectId && t.id === taskId
    );
    return exists
      ? Promise.resolve(result())
      : Promise.reject(notFound(projectId, taskId));
  }
}
