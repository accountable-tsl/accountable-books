import express from 'express';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { requestApp } from '../test/http.js';
import { createHealthRouter, markReady, markUnready } from './health.js';

const checkPostgres = vi.fn<() => Promise<unknown>>();
const checkRedis = vi.fn<() => Promise<unknown>>();

function createTestApp() {
  const app = express();
  app.use(
    '/health',
    createHealthRouter({
      checkPostgres,
      checkRedis,
    }),
  );
  return app;
}

describe('health endpoints', () => {
  beforeEach(() => {
    markUnready();
    vi.clearAllMocks();
    checkPostgres.mockResolvedValue(undefined);
    checkRedis.mockResolvedValue('PONG');
  });

  test('GET /health/live returns alive without dependency checks', async () => {
    const app = createTestApp();

    const res = await requestApp(app, { path: '/health/live' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ status: 'alive' });
    expect(checkPostgres).not.toHaveBeenCalled();
    expect(checkRedis).not.toHaveBeenCalled();
  });

  test('GET /health/ready returns 503 before startup is complete', async () => {
    const app = createTestApp();

    const res = await requestApp(app, { path: '/health/ready' });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: 'unavailable',
      checks: { startup: 'fail' },
    });
    expect(checkPostgres).not.toHaveBeenCalled();
    expect(checkRedis).not.toHaveBeenCalled();
  });

  test('GET /health/ready returns 200 when dependencies are reachable', async () => {
    const app = createTestApp();
    markReady();

    const res = await requestApp(app, { path: '/health/ready' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ready',
      checks: { postgres: 'ok', redis: 'ok' },
    });
  });

  test('GET /health/ready returns 503 when postgres is down', async () => {
    const app = createTestApp();
    markReady();
    checkPostgres.mockRejectedValueOnce(new Error('connection refused'));

    const res = await requestApp(app, { path: '/health/ready' });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: 'unavailable',
      checks: { postgres: 'fail', redis: 'ok' },
    });
  });

  test('GET /health/ready returns 503 when readiness is cleared', async () => {
    const app = createTestApp();
    markReady();
    markUnready();

    const res = await requestApp(app, { path: '/health/ready' });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: 'unavailable',
      checks: { startup: 'fail' },
    });
  });
});
