import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'seeds/**/*.test.ts'],
    globals: true,
    globalSetup: './test/global-setup.js',
    setupFiles: ['./test/setup.ts'],
    passWithNoTests: true,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
    },
  },
});
