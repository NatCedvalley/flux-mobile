// A stand-in for the flux-operations endpoints My Work, the Projects tab and
// task detail read, for CI runs that drive the app in a simulator with no
// backend (see .github/workflows/ios-simulator.yml). It doesn't check the
// token. Not for local development: use the real stack from the flux repo
// (CLAUDE.md §5).
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

function route(method, path, query) {
  if (method !== 'GET') {
    return null;
  }
  if (path === '/dashboard/my-tasks') {
    return [200, page(query.get('scope') === 'watching' ? [] : tasks())];
  }
  const task = path.match(/^\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  if (task) {
    const found = tasks().find(
      (t) => t.projectId === task[1] && t.id === task[2]
    );
    return found ? [200, found] : null;
  }
  if (path === '/notifications') {
    return [200, page([])];
  }
  return null;
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname.replace(BASE, '');
  // Harmless on native (CapacitorHttp skips CORS); lets a browser use it too.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  const [status, body] = route(req.method, path, url.searchParams) ?? [
    404,
    { code: 'NOT_FOUND', message: `No mock for ${req.method} ${path}` },
  ];
  console.log(
    `${new Date().toISOString()} ${req.method} ${req.url} → ${status}`
  );
  // Drain the request body before answering.
  req.resume();
  req.on('end', () => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
}).listen(PORT, () => {
  console.log(
    `Mock flux-operations listening on http://localhost:${PORT}${BASE}`
  );
});
