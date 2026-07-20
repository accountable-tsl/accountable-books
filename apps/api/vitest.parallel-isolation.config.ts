import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: { NODE_ENV: 'test' },
    fileParallelism: true,
    globalSetup: './test/global-setup.js',
    include: ['test/parallel-isolation/*.isolation.ts'],
    maxWorkers: 2,
    pool: 'forks',
    setupFiles: ['./test/setup.ts'],
  },
});
