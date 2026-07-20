import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

import { isTest } from '../../config/env.js';
import { redis, waitForRedisReady } from '../../lib/redis.js';

export const basicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests',
  keyGenerator: (req) => {
    const normalizedPath = req.route?.path || req.path;
    return req.ip + normalizedPath;
  },
});

const authLimiterOptions = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many requests',
  standardHeaders: true as const,
  legacyHeaders: false,
  keyGenerator: (req: Parameters<RequestHandler>[0]) => {
    const normalizedPath = req.route?.path || req.path;
    return `${req.ip}:${req.method}:${normalizedPath}`;
  },
};

let authLimiterHandler: RequestHandler | null = null;
let authLimiterInit: Promise<RequestHandler> | null = null;

function createAuthLimiterHandler(): RequestHandler {
  if (isTest) {
    return rateLimit(authLimiterOptions);
  }

  return rateLimit({
    ...authLimiterOptions,
    store: new RedisStore({
      sendCommand: ((command: string, ...args: (string | number)[]) =>
        redis.call(command, ...args)) as (...args: string[]) => Promise<any>,
    }),
  });
}

async function resolveAuthLimiter(): Promise<RequestHandler> {
  if (authLimiterHandler) {
    return authLimiterHandler;
  }

  if (!authLimiterInit) {
    authLimiterInit = (async () => {
      if (!isTest) {
        await waitForRedisReady();
      }
      authLimiterHandler = createAuthLimiterHandler();
      return authLimiterHandler;
    })();
  }

  return authLimiterInit;
}

/** Warm up auth rate limiter once Redis is reachable (called from setupApp). */
export async function initAuthLimiter(): Promise<void> {
  await resolveAuthLimiter();
}

export const authLimiter: RequestHandler = (req, res, next) => {
  resolveAuthLimiter()
    .then((limiter) => limiter(req, res, next))
    .catch(next);
};
