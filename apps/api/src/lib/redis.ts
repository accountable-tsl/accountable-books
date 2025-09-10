import { Redis } from 'ioredis';
import { ENV, isLocalStaging } from '../config/env.js';

const url = isLocalStaging ? ENV.LOCAL_STAGING_REDIS_URL : ENV.REDIS_URL;
console.log('REDIS_URL', ENV.REDIS_URL);
if (!url) throw new Error('Redis URL is not set');

export const redis = new Redis(url, {
  maxRetriesPerRequest: null,
});
