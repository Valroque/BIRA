import { defineConfig } from 'vitest/config';

/**
 * Tests share one Postgres DB (`bira_test`) and a `truncateAll()` helper
 * runs in `beforeEach`. Parallel execution would cause cross-contamination
 * between specs hitting the same tables, so we pin everything to a single
 * forked worker.
 */
export default defineConfig({
  test: {
    root: './tests',
    include: ['**/*.test.ts'],
    setupFiles: ['./setup.ts'],
    fileParallelism: false,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Don't watch by default; `npm test` runs once.
    watch: false,
  },
});
