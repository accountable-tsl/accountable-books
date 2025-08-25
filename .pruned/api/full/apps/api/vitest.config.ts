import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'seeds/**/*.test.ts'],
    globals: true,
    // The test environment is automatically loaded by src/config/env.ts
    // when NODE_ENV=test, which loads .env.test file
    env: {
      NODE_ENV: 'test',
    },
  },
});
