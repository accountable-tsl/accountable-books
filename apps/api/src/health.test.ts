import request from 'supertest';
import { expect, test } from 'vitest';
import { app } from './app.js';

test('GET /health returns ok', async () => {
  const res = await request(app).get('/health');
  try {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ ok: true });
    expect(Object.keys(res.body)).toEqual(['ok']);
  } catch (error: any) {
    throw new Error(`Health check failed: ${error.message}`);
  }
});
