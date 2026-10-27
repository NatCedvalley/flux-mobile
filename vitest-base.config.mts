import { defineConfig } from 'vitest/config';

// Coverage floors (FM-61), enforced whenever coverage runs: npm run
// test:coverage and the ci configuration. They live here rather than in
// angular.json because its coverageThresholds can't hold a per-folder floor.
// Each is the baseline measured on 2026-10-27, rounded down; raise them as
// coverage grows, never lower them to land a change.
export default defineConfig({
  test: {
    // Coverage slows the Projects list's paging specs (~1.5 s alone) past
    // Vitest's 5 s default when every spec file runs at once on a slow PC.
    testTimeout: 15_000,
    coverage: {
      thresholds: {
        statements: 92,
        branches: 85,
        functions: 89,
        lines: 92,
        'src/core/**': {
          statements: 95,
          branches: 89,
          functions: 92,
          lines: 95,
        },
      },
    },
  },
});
