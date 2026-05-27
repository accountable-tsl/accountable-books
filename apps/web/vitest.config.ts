import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@session': path.resolve(__dirname, 'src/app/session'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    // Cap worker threads to avoid a large number of node:vitest processes.
    pool: 'threads',
    maxWorkers: 2,
    // Load test environment variables from .env.test
    env: {
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
    },
  },
});
