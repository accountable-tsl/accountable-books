import { type NextFunction, type Response } from 'express';

import type { AuthRequest } from '../../features/auth/auth.types.js';
import type { AuditContextInput } from './audit.types.js';

export function buildRequestAuditContext(
  req: Pick<AuthRequest, 'ip' | 'get'> & { id?: unknown; headers?: unknown },
): AuditContextInput {
  const getHeader =
    typeof req.get === 'function' ? req.get.bind(req) : (_name: string) => null;

  const rawCorrelationId =
    typeof getHeader('x-correlation-id') === 'string'
      ? getHeader('x-correlation-id')
      : null;

  return {
    source: 'api',
    requestId: typeof req.id === 'string' ? req.id : null,
    correlationId: rawCorrelationId?.trim() || null,
    ip: req.ip ?? null,
    userAgent: getHeader('user-agent') ?? null,
  };
}

export function attachAuditContext(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) {
  req.auditContext = buildRequestAuditContext(req);
  return next();
}

export function getAuditContext(
  req: Pick<AuthRequest, 'auditContext'>,
): AuditContextInput {
  return req.auditContext ?? { source: 'api' };
}
