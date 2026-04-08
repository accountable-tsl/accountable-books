import { describe, expect, it } from 'vitest';

import {
  attachAuditContext,
  buildRequestAuditContext,
  getAuditContext,
} from '../audit.middleware.js';

describe('audit middleware', () => {
  it('builds normalized request audit context', () => {
    const req = {
      id: 'req-123',
      ip: '127.0.0.1',
      get: (name: string) => {
        if (name === 'user-agent') return 'Vitest';
        if (name === 'x-correlation-id') return 'corr-456';
        return null;
      },
    } as any;

    expect(buildRequestAuditContext(req)).toEqual({
      source: 'api',
      requestId: 'req-123',
      correlationId: 'corr-456',
      ip: '127.0.0.1',
      userAgent: 'Vitest',
    });
  });

  it('attaches audit context to the request', () => {
    const req = {
      id: 'req-abc',
      ip: '10.0.0.1',
      get: (name: string) => (name === 'user-agent' ? 'TestAgent' : null),
    } as any;
    const next = ((): void => undefined) as any;

    attachAuditContext(req, {} as any, next);

    expect(req.auditContext).toEqual({
      source: 'api',
      requestId: 'req-abc',
      correlationId: null,
      ip: '10.0.0.1',
      userAgent: 'TestAgent',
    });
  });

  it('returns attached context and falls back safely when absent', () => {
    expect(
      getAuditContext({
        auditContext: {
          source: 'api',
          requestId: 'req-xyz',
          correlationId: null,
          ip: null,
          userAgent: null,
        },
      } as any),
    ).toEqual({
      source: 'api',
      requestId: 'req-xyz',
      correlationId: null,
      ip: null,
      userAgent: null,
    });

    expect(getAuditContext({ auditContext: undefined } as any)).toEqual({
      source: 'api',
    });
  });
});
