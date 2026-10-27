// A stand-in for the flux-operations endpoints My Work, the Projects tab,
// task detail and the Inbox read, for CI runs that drive the app in a
// simulator with no backend (see .github/workflows/ios-simulator.yml). CI-1
// has a comment thread and activity, and there are three notifications, so
// the design screenshots (ios-design-screens.sh) aren't empty states. It
// doesn't check the token.
//
// The Playwright tests (e2e/) also write: a status change, a comment, a new
// task and a notification read change what later GETs answer, until
// `POST /__mock/reset`, which each test sends first. The simulator scripts
// only read, so they always get the fixtures below. Not for local
// development: use the real stack from the flux repo (CLAUDE.md §5).
//
//   node scripts/ci/mock-operations.mjs            # listens on :9003
//   MOCK_OPERATIONS_PORT=9103 node scripts/ci/mock-operations.mjs
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_OPERATIONS_PORT ?? 9003);
const BASE = '/api/v1';

/** The local day `days` from today, as YYYY-MM-DD. */
function day(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${date}`;
}

const PROJECT = { projectId: 'ci-p1', projectKey: 'CI', projectName: 'CI' };

/** GET /projects/mine: the one project, so the Projects tab opens it. */
const MY_PROJECTS = [
  {
    project: {
      id: 'ci-p1',
      projectKey: 'CI',
      name: 'CI',
      categoryPositions: { PLANNING: 0, TODO: 1, IN_PROGRESS: 2, DONE: 3 },
    },
    role: 'EDITOR',
    openCount: 3,
    overdueCount: 1,
  },
];

const STATUSES = [
  {
    id: 'ci-s1',
    projectId: 'ci-p1',
    slug: 'todo',
    name: 'To Do',
    category: 'TODO',
    color: 'blue',
    position: 0,
  },
  {
    id: 'ci-s2',
    projectId: 'ci-p1',
    slug: 'in_progress',
    name: 'In Progress',
    category: 'IN_PROGRESS',
    color: 'amber',
    position: 1,
  },
  {
    id: 'ci-s3',
    projectId: 'ci-p1',
    slug: 'done',
    name: 'Done',
    category: 'DONE',
    color: 'green',
    position: 2,
    isClosed: true,
  },
];

// The signed-in account (mock-iam.mjs), and two teammates.
const ME = { accountId: 'ci-account', firstName: 'CI', lastName: 'Tester' };
const MIRA = { accountId: 'ci-a2', firstName: 'Mira', lastName: 'Kaur' };
const JAE = { accountId: 'ci-a3', firstName: 'Jae', lastName: 'Doyle' };

/** `days` days before now, at `hh:mm` local time. */
function at(days, hh, mm) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

/** `minutes` before now. */
function ago(minutes) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/** CI-1's thread: one by Mira with a reply and a reaction, then one of ours. */
function comments() {
  const by = (person) => ({
    authorId: person.accountId,
    authorFirstName: person.firstName,
    authorLastName: person.lastName,
  });
  return [
    {
      id: 'ci-c1',
      taskId: 'ci-t1',
      ...by(MIRA),
      body: 'Reproduced on an iPhone 15. Only happens when the description is longer than the screen.',
      bodyFormat: 'MARKDOWN',
      createdAt: at(1, 10, 4),
      reactions: [{ emoji: 'thumbs_up', count: 2, reactedByMe: true }],
      replies: [
        {
          id: 'ci-c2',
          taskId: 'ci-t1',
          parentCommentId: 'ci-c1',
          ...by(JAE),
          body: 'Same on the Pixel 7.',
          bodyFormat: 'MARKDOWN',
          createdAt: at(1, 11, 30),
        },
      ],
    },
    {
      id: 'ci-c3',
      taskId: 'ci-t1',
      ...by(ME),
      body: 'Root cause is the fixed `100vh` on the detail shell. Patch is up.',
      bodyFormat: 'MARKDOWN',
      createdAt: at(0, 8, 12),
    },
  ];
}

/** CI-1's activity, newest first, over two days. */
function activities() {
  const entry = (id, action, createdAt, fields = {}) => ({
    id,
    taskId: 'ci-t1',
    projectId: 'ci-p1',
    actorId: MIRA.accountId,
    actorName: 'Mira Kaur',
    action,
    createdAt,
    ...fields,
  });
  return [
    entry('ci-e4', 'COMMENT_ADDED', at(0, 8, 12), {
      actorId: ME.accountId,
      actorName: 'CI Tester',
    }),
    entry('ci-e3', 'STATUS_CHANGED', at(0, 8, 2), {
      field: 'status',
      oldValue: 'todo',
      newValue: 'in_progress',
    }),
    entry('ci-e2', 'FIELD_UPDATED', at(1, 16, 40), {
      field: 'priority',
      oldValue: 'MEDIUM',
      newValue: 'HIGH',
    }),
    entry('ci-e1', 'CREATED', at(1, 9, 0), { actorName: 'Jae Doyle' }),
  ];
}

/** Three notifications, newest first: two unread, one a mention. */
function notifications() {
  const about = (entityId, taskKey) => ({
    entityType: 'TASK',
    entityId,
    taskKey,
    projectId: 'ci-p1',
    projectName: 'CI',
  });
  const by = (person) => ({
    actorId: person.accountId,
    actorFirstName: person.firstName,
    actorLastName: person.lastName,
  });
  return [
    {
      id: 'ci-n1',
      type: 'MENTION',
      title: 'You were mentioned',
      message: 'Mira Kaur mentioned you in: Check the swipe-back gesture',
      ...about('ci-t1', 'CI-1'),
      ...by(MIRA),
      isRead: false,
      createdAt: ago(18),
    },
    {
      id: 'ci-n2',
      type: 'ASSIGNMENT',
      title: 'You were assigned to a task',
      message: 'Jae Doyle assigned you to: Fix the overdue report',
      ...about('ci-t2', 'CI-2'),
      ...by(JAE),
      isRead: false,
      createdAt: ago(2 * 60),
    },
    {
      id: 'ci-n3',
      type: 'COMMENT',
      title: 'New comment',
      message: 'Jae Doyle commented on: Check the swipe-back gesture',
      ...about('ci-t1', 'CI-1'),
      ...by(JAE),
      isRead: true,
      createdAt: at(1, 11, 30),
    },
  ];
}

/** The notifications a `type` comma list and `isRead` let through. */
function notificationsFor(query) {
  const types = query.get('type')?.split(',') ?? [];
  const isRead = query.get('isRead');
  return currentNotifications().filter(
    (n) =>
      (!types.length || types.includes(n.type)) &&
      (isRead === null || String(n.isRead) === isRead)
  );
}

const RESOLUTIONS = [
  { id: 'ci-r1', name: 'Done', slug: 'done', position: 0 },
  { id: 'ci-r2', name: 'Won’t do', slug: 'wont-do', position: 1 },
  { id: 'ci-r3', name: 'Duplicate', slug: 'duplicate', position: 2 },
];

const LABELS = [
  { id: 'ci-l1', projectId: 'ci-p1', name: 'gestures' },
  { id: 'ci-l2', projectId: 'ci-p1', name: 'ios' },
  { id: 'ci-l3', projectId: 'ci-p1', name: 'reports' },
];

const MEMBERS = [
  { ...ME, email: 'ci@flux.test', role: 'EDITOR' },
  { ...MIRA, email: 'mira@flux.test', role: 'LEAD' },
  { ...JAE, email: 'jae@flux.test', role: 'EDITOR' },
].map((m) => ({ ...m, projectId: 'ci-p1' }));

function tasks() {
  return [
    {
      id: 'ci-t1',
      ...PROJECT,
      taskKey: 'CI-1',
      title: 'Check the swipe-back gesture',
      description: 'Opened by scripts/ci/ios-swipe-back.sh.',
      type: 'TASK',
      priority: 'HIGH',
      status: 'in_progress',
      statusName: 'In Progress',
      statusCategory: 'IN_PROGRESS',
      dueDate: day(0),
      assignees: [ME],
      reporterId: JAE.accountId,
      reporterFirstName: JAE.firstName,
      reporterLastName: JAE.lastName,
      labels: ['gestures', 'ios'],
    },
    {
      id: 'ci-t2',
      ...PROJECT,
      taskKey: 'CI-2',
      title: 'Fix the overdue report',
      type: 'BUG',
      priority: 'MEDIUM',
      status: 'todo',
      statusName: 'To Do',
      statusCategory: 'TODO',
      dueDate: day(-1),
    },
    {
      id: 'ci-t3',
      ...PROJECT,
      taskKey: 'CI-3',
      title: 'Plan the next release',
      type: 'FEATURE',
      priority: 'LOW',
      status: 'todo',
      statusName: 'To Do',
      statusCategory: 'TODO',
      dueDate: day(3),
    },
  ];
}

/** What the e2e tests' writes changed, on top of the fixtures. */
function fresh() {
  return {
    // Task id → { slug, resolution } of its last status change.
    status: {},
    // Ids of notifications marked read.
    read: new Set(),
    // Task id → the comments posted on it.
    added: {},
    // Tasks created, after the fixtures.
    created: [],
  };
}

let state = fresh();

/** The task fields a status slug sets. */
function statusFields(slug) {
  const status = STATUSES.find((s) => s.slug === slug);
  return {
    status: status.slug,
    statusName: status.name,
    statusCategory: status.category,
  };
}

/** The fixture tasks and created ones, with their status changes. */
function currentTasks() {
  return [...tasks(), ...state.created].map((t) => {
    const change = state.status[t.id];
    return change
      ? {
          ...t,
          ...statusFields(change.slug),
          resolution: change.resolution,
        }
      : t;
  });
}

function currentNotifications() {
  return notifications().map((n) =>
    state.read.has(n.id) ? { ...n, isRead: true } : n
  );
}

/** A write's answer, or null for a 404. */
function write(method, path, body) {
  if (method === 'POST' && path === '/__mock/reset') {
    state = fresh();
    return [204, null];
  }
  const status = path.match(/^\/projects\/[^/]+\/tasks\/([^/]+)\/status$/);
  if (method === 'PATCH' && status) {
    if (!STATUSES.some((s) => s.slug === body.status)) {
      return [
        400,
        { code: 'VALIDATION_ERROR', message: `No status ${body.status}` },
      ];
    }
    if (!currentTasks().some((t) => t.id === status[1])) {
      return null;
    }
    state.status[status[1]] = {
      slug: body.status,
      resolution: body.resolution,
    };
    return [200, currentTasks().find((t) => t.id === status[1])];
  }
  const comment = path.match(/^\/projects\/[^/]+\/tasks\/([^/]+)\/comments$/);
  if (method === 'POST' && comment) {
    const added = (state.added[comment[1]] ??= []);
    const posted = {
      id: `ci-c-new-${added.length + 1}`,
      taskId: comment[1],
      authorId: ME.accountId,
      authorFirstName: ME.firstName,
      authorLastName: ME.lastName,
      body: body.body,
      bodyFormat: body.bodyFormat ?? 'MARKDOWN',
      createdAt: new Date().toISOString(),
      reactions: [],
      replies: [],
    };
    added.push(posted);
    return [201, posted];
  }
  if (method === 'POST' && path === '/projects/ci-p1/tasks') {
    const number =
      Math.max(...currentTasks().map((t) => Number(t.taskKey.slice(3)))) + 1;
    const assignee = [ME, MIRA, JAE].find(
      (p) => p.accountId === body.assigneeId
    );
    const task = {
      id: `ci-t${number}`,
      ...PROJECT,
      taskKey: `CI-${number}`,
      title: body.title,
      description: body.description,
      type: body.type ?? 'TASK',
      priority: body.priority ?? 'MEDIUM',
      // No status is the default, so a new task starts in the first TODO.
      ...statusFields('todo'),
      dueDate: body.dueDate,
      assignees: assignee ? [assignee] : [],
      reporterId: ME.accountId,
      reporterFirstName: ME.firstName,
      reporterLastName: ME.lastName,
      labels: [],
      createdAt: new Date().toISOString(),
    };
    state.created.push(task);
    return [201, task];
  }
  const read = path.match(/^\/notifications\/([^/]+)\/read$/);
  if (method === 'PATCH' && read) {
    const found = notifications().find((n) => n.id === read[1]);
    if (!found) {
      return [
        404,
        { code: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found' },
      ];
    }
    state.read.add(found.id);
    return [200, { ...found, isRead: true }];
  }
  return null;
}

function page(content) {
  return {
    content,
    page: 0,
    size: 100,
    totalElements: content.length,
    totalPages: 1,
    first: true,
    last: true,
  };
}

function route(method, path, query, body) {
  if (method !== 'GET') {
    return write(method, path, body);
  }
  if (path === '/dashboard/my-tasks') {
    return [200, page(query.get('scope') === 'watching' ? [] : currentTasks())];
  }
  if (path === '/projects/mine') {
    return [200, page(MY_PROJECTS)];
  }
  // The Projects tab asks for one status group at a time.
  const list = path.match(/^\/projects\/([^/]+)\/tasks$/);
  if (list) {
    // Every task has a due date, so the calendar's drawer is empty.
    if (query.get('onlyUnscheduled') === 'true') {
      return [200, page([])];
    }
    const status = query.get('status');
    return [
      200,
      page(
        currentTasks().filter(
          (t) => t.projectId === list[1] && (!status || t.status === status)
        )
      ),
    ];
  }
  if (path === '/projects/ci-p1/workflow-statuses') {
    return [200, STATUSES];
  }
  if (path === '/projects/ci-p1/task-view-settings') {
    return [200, {}];
  }
  if (path === '/projects/ci-p1/resolutions') {
    return [200, RESOLUTIONS];
  }
  if (path === '/projects/ci-p1/labels') {
    return [200, LABELS];
  }
  if (path === '/projects/ci-p1/members/assignable') {
    return [200, MEMBERS];
  }
  const task = path.match(/^\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  if (task) {
    const found = currentTasks().find(
      (t) => t.projectId === task[1] && t.id === task[2]
    );
    return found ? [200, found] : null;
  }
  // What task detail fetches besides the task: CI-1 has comments and
  // activity; nothing has attachments or subtasks, and nothing is watched.
  const sub = path.match(
    /^\/projects\/[^/]+\/tasks\/([^/]+)\/(activities|attachments|children|comments|subscription)$/
  );
  if (sub) {
    const first = sub[1] === 'ci-t1';
    const bodies = {
      activities: page(first ? activities() : []),
      attachments: [],
      children: [],
      comments: page([
        ...(first ? comments() : []),
        ...(state.added[sub[1]] ?? []),
      ]),
      subscription: { subscribed: false },
    };
    return [200, bodies[sub[2]]];
  }
  if (path === '/notifications') {
    return [200, page(notificationsFor(query))];
  }
  // The Inbox tab's badge and its Mentions count.
  if (path === '/notifications/unread-count') {
    query.set('isRead', 'false');
    return [200, { unreadCount: notificationsFor(query).length }];
  }
  return null;
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname.replace(BASE, '');
  // Harmless on native (CapacitorHttp skips CORS); lets a browser use it too.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  // A browser's preflight only lets GET, HEAD and POST through without this.
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, PATCH, DELETE'
  );
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const text = Buffer.concat(chunks).toString();
    const [status, body] = route(
      req.method,
      path,
      url.searchParams,
      text ? JSON.parse(text) : {}
    ) ?? [
      404,
      { code: 'NOT_FOUND', message: `No mock for ${req.method} ${path}` },
    ];
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.url} → ${status}`
    );
    if (body === null) {
      res.writeHead(status).end();
      return;
    }
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
}).listen(PORT, () => {
  console.log(
    `Mock flux-operations listening on http://localhost:${PORT}${BASE}`
  );
});
