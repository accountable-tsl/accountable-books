import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

import { isTest } from '../../config/env.js';
import { redis } from '../../lib/redis.js';

export const basicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests',
  keyGenerator: (req) => {
    const normalizedPath = req.route?.path || req.path;
    return req.ip + normalizedPath;
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per window
  message: 'Too many requests',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const normalizedPath = req.route?.path || req.path;
    return `${req.ip}:${req.method}:${normalizedPath}`;
  },
  store: isTest
    ? undefined
    : new RedisStore({
        sendCommand: ((command: string, ...args: (string | number)[]) =>
          redis.call(command, ...args)) as (...args: string[]) => Promise<any>,
      }),
});
