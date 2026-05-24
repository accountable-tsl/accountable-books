import type { Level, Logger } from 'pino';

import { getLogger } from '../utils/logger.js';

type LogLevel = Level;

type LogFlowStepInput = {
  logger?: Logger;
  flow: string;
  step: string;
  message?: string;
  level?: LogLevel;
  status?: string;
  durationMs?: number;
  err?: unknown;
} & Record<string, unknown>;

function normalizeErr(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { error: err };
  }

  if (err === undefined) {
    return {};
  }

  return { error: err };
}

export function logFlowStep(input: LogFlowStepInput) {
  const {
    logger,
    flow,
    step,
    message,
    level = 'info',
    status,
    durationMs,
    err,
    ...extra
  } = input;

  const entryLogger = logger ?? getLogger();
  const payload = {
    flow,
    step,
    ...(status !== undefined ? { status } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...normalizeErr(err),
    ...extra,
  };

  entryLogger[level](payload, message ?? `${flow}.${step}`);
}
