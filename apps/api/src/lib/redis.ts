import { Redis } from 'ioredis';
import { ENV, isDev } from '../config/env.js';

const url: string = isDev ? ENV.REDIS_URL || 'redis://localhost:6379' : ENV.REDIS_URL || '';
if (!url) throw new Error('Redis URL is not set');

export const redis: Redis = new Redis(url, {
  maxRetriesPerRequest: null,
});
