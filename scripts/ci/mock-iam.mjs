// A stand-in for flux-iam's sign-in endpoints, for CI runs that drive the
// app in a simulator with no backend (see .github/workflows/ios-simulator.yml).
// Any email and password sign in, as a fixed test account. Not for local
// development: use the real stack from the flux repo (CLAUDE.md §5).
//
//   node scripts/ci/mock-iam.mjs            # listens on :9001
//   MOCK_IAM_PORT=9101 node scripts/ci/mock-iam.mjs
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_IAM_PORT ?? 9001);
const BASE = '/api/v1';

const ACCOUNT = {
  id: 'ci-account',
  email: 'ci@flux.test',
  firstName: 'CI',
  lastName: 'Tester',
  displayName: 'CI Tester',
  accountType: 'INTERNAL',
  systemRole: 'USER',
  status: 'ACTIVE',
  emailVerified: true,
};

let issued = 0;
function tokens() {
  issued += 1;
  return {
    accessToken: `ci-access-${issued}`,
    refreshToken: `ci-refresh-${issued}`,
    expiresIn: 3600,
    tokenType: 'Bearer',
  };
}

const routes = {
  'POST /auth/login': () => [200, tokens()],
  'POST /auth/refresh': () => [200, tokens()],
  'POST /auth/logout': () => [204, null],
  'GET /accounts/me': () => [200, ACCOUNT],
};

createServer((req, res) => {
  const path = (req.url ?? '').split('?')[0].replace(BASE, '');
  const route = routes[`${req.method} ${path}`];
  // Harmless on native (CapacitorHttp skips CORS); lets a browser use it too.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  const [status, body] = route
    ? route()
    : [
        404,
        { code: 'NOT_FOUND', message: `No mock for ${req.method} ${path}` },
      ];
  console.log(
    `${new Date().toISOString()} ${req.method} ${req.url} → ${status}`
  );
  // Drain the request body before answering.
  req.resume();
  req.on('end', () => {
    if (body === null) {
      res.writeHead(status).end();
      return;
    }
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
}).listen(PORT, () => {
  console.log(`Mock flux-iam listening on http://localhost:${PORT}${BASE}`);
});
