import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'seeds/**/*.test.ts'],
    globals: true,
    // Run DB migrations once before the suite and tear down once after.
    globalSetup: './test/global-setup.ts',
    // Keep worker count small to avoid many node:vitest processes eating RAM.
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 2,
      },
    },
    passWithNoTests: true,
    // The test environment is automatically loaded by src/config/env.ts
    // when NODE_ENV=test, which loads .env.test file
    env: {
      NODE_ENV: 'test',
    },
  },
});
