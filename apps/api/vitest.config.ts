import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true,
    env: {
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'test-access-secret-key-for-ci',
      JWT_REFRESH_SECRET: 'test-refresh-secret-key-for-ci',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6380',
      PORT: '3001',
      API_BASE_URL: 'http://localhost:3001',
      FRONTEND_URL: 'http://localhost:3000',
      CORS_ORIGIN: 'http://localhost:3000',
    },
  },
});
