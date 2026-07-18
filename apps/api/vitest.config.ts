import { defineConfig } from 'vitest/config';

import { resolveTestWorkerCount } from './config/test-worker-sandbox.js';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'seeds/**/*.test.ts'],
    globals: true,
    globalSetup: './test/global-setup.js',
    setupFiles: ['./test/setup.ts'],
    passWithNoTests: true,
    fileParallelism: true,
    maxWorkers: resolveTestWorkerCount(),
    pool: 'forks',
    env: {
      NODE_ENV: 'test',
    },
  },
});
