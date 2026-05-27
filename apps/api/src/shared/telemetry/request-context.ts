import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Job } from 'bullmq';
import {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';

export type RequestContextSource = 'api' | 'worker' | 'scheduler';

export interface RequestContext {
  requestId: string;
  correlationId: string;
  userId?: string;
  companyId?: string;
  processSource: RequestContextSource;
}

export interface JobTelemetryContext {
  requestId?: string;
  correlationId?: string;
  userId?: string;
  companyId?: string;
}

export type JobDataWithTelemetry<T extends object> = T & {
  _telemetry?: JobTelemetryContext;
};

type RequestWithTelemetryIds = Request & { id?: unknown };

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function runWithRequestContext<T>(seed: RequestContext, fn: () => T): T {
  return requestContextStorage.run(seed, fn);
}

export function updateRequestContext(
  patch: Partial<
    Omit<RequestContext, 'requestId' | 'correlationId' | 'processSource'>
  >,
) {
  const current = getRequestContext();
  if (!current) return;

  Object.assign(current, patch);
}

function normalizeHeaderValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTelemetryValue(value: unknown): string | undefined {
  return normalizeHeaderValue(value) ?? undefined;
}

function getRequestContextTelemetry(): JobTelemetryContext | undefined {
  const context = getRequestContext();
  if (!context) {
    return undefined;
  }

  return {
    requestId: context.requestId,
    correlationId: context.correlationId,
    ...(context.userId ? { userId: context.userId } : {}),
    ...(context.companyId ? { companyId: context.companyId } : {}),
  };
}

function generateRequestContextSeed(
  req: RequestWithTelemetryIds,
  source: RequestContextSource,
): RequestContext {
  const existingCorrelationId =
    normalizeHeaderValue(req.header('x-correlation-id')) ?? randomUUID();
  const requestId = randomUUID();

  req.id = requestId;

  return {
    requestId,
    correlationId: existingCorrelationId,
    processSource: source,
  };
}

export const requestContextMiddleware: RequestHandler = function (
  req: RequestWithTelemetryIds,
  res: Response,
  next: NextFunction,
) {
  const seed = generateRequestContextSeed(req, 'api');

  res.setHeader('X-Request-Id', seed.requestId);
  res.setHeader('X-Correlation-Id', seed.correlationId);

  return runWithRequestContext(seed, next);
};

function getJobTelemetryContext(
  job: Job<unknown>,
): JobTelemetryContext | undefined {
  const data =
    job.data && typeof job.data === 'object'
      ? (job.data as Record<string, unknown>)
      : undefined;
  const telemetry = data?._telemetry;

  if (!telemetry || typeof telemetry !== 'object') {
    return undefined;
  }

  return telemetry as JobTelemetryContext;
}

export function withJobTelemetry<T extends object>(
  data: T,
): JobDataWithTelemetry<T> {
  const contextTelemetry = getRequestContextTelemetry();
  const existingTelemetry =
    '_telemetry' in data &&
    typeof data._telemetry === 'object' &&
    data._telemetry !== null
      ? (data._telemetry as JobTelemetryContext)
      : undefined;

  const telemetry: JobTelemetryContext = {
    requestId:
      normalizeTelemetryValue(existingTelemetry?.requestId) ??
      contextTelemetry?.requestId,
    correlationId:
      normalizeTelemetryValue(existingTelemetry?.correlationId) ??
      contextTelemetry?.correlationId,
    userId:
      normalizeTelemetryValue(existingTelemetry?.userId) ??
      contextTelemetry?.userId,
    companyId:
      normalizeTelemetryValue(existingTelemetry?.companyId) ??
      contextTelemetry?.companyId,
  };

  if (
    !telemetry.requestId &&
    !telemetry.correlationId &&
    !telemetry.userId &&
    !telemetry.companyId
  ) {
    return data as JobDataWithTelemetry<T>;
  }

  return {
    ...data,
    _telemetry: telemetry,
  };
}

export async function runWithJobContext<T>(
  job: Job<unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const telemetry = getJobTelemetryContext(job);
  const seed: RequestContext = {
    requestId:
      (typeof telemetry?.requestId === 'string'
        ? telemetry.requestId.trim()
        : '') || randomUUID(),
    correlationId:
      (typeof telemetry?.correlationId === 'string'
        ? telemetry.correlationId.trim()
        : '') || randomUUID(),
    ...(telemetry?.userId ? { userId: telemetry.userId } : {}),
    ...(telemetry?.companyId ? { companyId: telemetry.companyId } : {}),
    processSource: 'worker',
  };

  return await runWithRequestContext(seed, fn);
}
