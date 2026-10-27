import { defineConfig, devices } from '@playwright/test';

// End-to-end tests of the critical flows (FM-62), against the dev build and
// the CI mocks in scripts/ci/, whose dev URLs (localhost:9001 and :9003) the
// dev environment already uses. The mocks keep one shared state that each
// test resets, so the tests run one at a time.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env['CI'],
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // The iPhone 17's screen, as the simulator job measures it.
        viewport: { width: 402, height: 874 },
      },
    },
  ],
  webServer: [
    // Never reused: a real backend on these ports would answer instead.
    {
      command: 'node scripts/ci/mock-iam.mjs',
      url: 'http://localhost:9001/api/v1/accounts/me',
      reuseExistingServer: false,
    },
    {
      command: 'node scripts/ci/mock-operations.mjs',
      url: 'http://localhost:9003/api/v1/dashboard/my-tasks',
      reuseExistingServer: false,
    },
    {
      command: 'npm start',
      url: 'http://localhost:4200',
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
    },
  ],
});
