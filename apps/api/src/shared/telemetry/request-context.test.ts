import { describe, expect, it } from 'vitest';

import { buildRequestAuditContext } from '../../domains/audit/audit.middleware.js';
import {
  getRequestContext,
  requestContextMiddleware,
  runWithJobContext,
  runWithRequestContext,
  updateRequestContext,
} from './request-context.js';

describe('request context', () => {
  it('preserves inbound correlation ids across async boundaries', async () => {
    const headers: Record<string, string> = {};
    const req = {
      headers: {
        'x-correlation-id': 'corr-from-client',
      },
      header(name: string) {
        return this.headers[name.toLowerCase() as keyof typeof this.headers];
      },
      get(name: string) {
        return this.header(name);
      },
    } as any;
    const res = {
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = value;
      },
    } as any;

    let context: ReturnType<typeof getRequestContext>;
    await requestContextMiddleware(req, res, async () => {
      await Promise.resolve();
      context = getRequestContext();
    });

    expect(headers['x-correlation-id']).toBe('corr-from-client');
    expect(headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(context).toEqual({
      requestId: headers['x-request-id'],
      correlationId: 'corr-from-client',
      processSource: 'api',
    });
  });

  it('generates ids and supports patching context without losing them', async () => {
    const headers: Record<string, string> = {};
    const req = {
      headers: {},
      header(name: string) {
        return this.headers[name.toLowerCase() as keyof typeof this.headers];
      },
      get(name: string) {
        return this.header(name);
      },
    } as any;
    const res = {
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = value;
      },
    } as any;

    let context: ReturnType<typeof getRequestContext>;
    await requestContextMiddleware(req, res, async () => {
      updateRequestContext({
        userId: 'user-123',
        companyId: 'company-uuid-456',
      });
      await Promise.resolve();
      context = getRequestContext();
    });

    expect(headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(headers['x-correlation-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(context).toEqual({
      requestId: headers['x-request-id'],
      correlationId: headers['x-correlation-id'],
      userId: 'user-123',
      companyId: 'company-uuid-456',
      processSource: 'api',
    });
  });

  it('hydrates worker context from job telemetry and falls back safely', async () => {
    const jobWithTelemetry = {
      data: {
        _telemetry: {
          requestId: 'req-1',
          correlationId: 'corr-1',
          userId: 'user-1',
          companyId: 'company-1',
        },
      },
    } as any;

    const hydrated = await runWithJobContext(jobWithTelemetry, async () => {
      await Promise.resolve();
      return getRequestContext();
    });

    expect(hydrated).toEqual({
      requestId: 'req-1',
      correlationId: 'corr-1',
      userId: 'user-1',
      companyId: 'company-1',
      processSource: 'worker',
    });

    const fallback = await runWithJobContext({ data: {} } as any, async () => {
      return getRequestContext();
    });

    expect(fallback?.processSource).toBe('worker');
    expect(fallback?.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(fallback?.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('feeds normalized ids into audit context via ALS', () => {
    const context = runWithRequestContext(
      {
        requestId: 'req-from-als',
        correlationId: 'corr-from-als',
        processSource: 'api',
      },
      () =>
        buildRequestAuditContext({
          id: 'req-from-request',
          ip: '127.0.0.1',
          get: (name: string) => {
            if (name === 'user-agent') return 'Vitest';
            if (name === 'x-correlation-id') return 'corr-from-header';
            return null;
          },
        } as any),
    );

    expect(context).toEqual({
      source: 'api',
      requestId: 'req-from-als',
      correlationId: 'corr-from-als',
      ip: '127.0.0.1',
      userAgent: 'Vitest',
    });
  });
});
