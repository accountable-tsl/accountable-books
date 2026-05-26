import pino from 'pino';
import { describe, expect, it } from 'vitest';

import { runWithRequestContext } from '../telemetry/request-context.js';
import { getLogger, LOG_LEVELS, logger } from './logger.js';

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

describe('logger contract (B12)', () => {
  it('emits JSON with base service fields when no request context', async () => {
    const payload = await captureJsonLog(() => {
      getLogger({ component: 'contract-test', processSource: 'api' }).info(
        'baseline',
      );
    });

    expect(payload.service).toBe('accountable-books-api');
    expect(payload.level).toBe(30);
    expect(payload.msg).toBe('baseline');
    expect(payload.component).toBe('contract-test');
    expect(payload.processSource).toBe('api');
  });

  it('defines silent level for test and info for staging/production', () => {
    expect(LOG_LEVELS.test).toBe('silent');
    expect(LOG_LEVELS.local).toBe('debug');
    expect(LOG_LEVELS.staging).toBe('info');
    expect(LOG_LEVELS.production).toBe('info');
  });
});

describe('getLogger', () => {
  it('adds ALS fields to emitted logs', async () => {
    const payload = await captureJsonLog(async () => {
      await runWithRequestContext(
        {
          requestId: 'req-logger',
          correlationId: 'corr-logger',
          userId: 'user-logger',
          companyId: 'company-logger',
          processSource: 'api',
        },
        async () => {
          await Promise.resolve();
          getLogger({ component: 'logger-test' }).info(
            { feature: 'als' },
            'ctx',
          );
        },
      );
    });

    expect(payload.requestId).toBe('req-logger');
    expect(payload.correlationId).toBe('corr-logger');
    expect(payload.userId).toBe('user-logger');
    expect(payload.companyId).toBe('company-logger');
    expect(payload.processSource).toBe('api');
    expect(payload.component).toBe('logger-test');
    expect(payload.feature).toBe('als');
    expect(payload.msg).toBe('ctx');
  });
});
