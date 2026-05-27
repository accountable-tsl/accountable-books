import pino from 'pino';
import { describe, expect, it } from 'vitest';

import { logger } from '../utils/logger.js';
import { logFlowStep } from './log-flow-step.js';
import { runWithRequestContext } from './request-context.js';

function parseLastLogLine(lines: string[]) {
  const line = lines.at(-1);
  if (!line) throw new Error('Expected a log line to be captured');
  return JSON.parse(line.trim());
}

async function captureJsonLog(run: () => void | Promise<void>) {
  const lines: string[] = [];
  const stream = (logger as any)[pino.symbols.streamSym] as {
    write: (chunk: string | Uint8Array) => boolean;
  };
  const originalWrite = stream.write.bind(stream);
  stream.write = (chunk: string | Uint8Array) => {
    lines.push(
      typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'),
    );
    return true;
  };

  const previousLevel = logger.level;
  logger.level = 'info';

  try {
    await run();
  } finally {
    logger.level = previousLevel;
    stream.write = originalWrite;
  }

  return parseLastLogLine(lines);
}

describe('logFlowStep', () => {
  it('logs the standard flow/step contract and normalizes errors', async () => {
    const payload = await captureJsonLog(async () => {
      await runWithRequestContext(
        {
          requestId: 'req-flow',
          correlationId: 'corr-flow',
          processSource: 'api',
        },
        async () => {
          logFlowStep({
            flow: 'signup',
            step: 'create_user',
            status: 'failed',
            durationMs: 23,
            err: new Error('boom'),
            companyId: 'company-from-extra',
          });
        },
      );
    });

    expect(payload.flow).toBe('signup');
    expect(payload.step).toBe('create_user');
    expect(payload.status).toBe('failed');
    expect(payload.durationMs).toBe(23);
    expect(payload.requestId).toBe('req-flow');
    expect(payload.correlationId).toBe('corr-flow');
    expect(payload.companyId).toBe('company-from-extra');
    expect(payload.error.message).toBe('boom');
    expect(payload.msg).toBe('signup.create_user');
  });
});
