import { Redis } from 'ioredis';

import { ENV, isLocalStaging } from '../config/env.js';

const url = isLocalStaging ? ENV.LOCAL_STAGING_REDIS_URL : ENV.REDIS_URL;
// Keep module import side-effect free; misconfigured Redis should fail on use.
const fallbackRedisUrl = 'redis://127.0.0.1:1';

export const redis = new Redis(url ?? fallbackRedisUrl, {
  enableOfflineQueue: false,
  lazyConnect: !url,
  maxRetriesPerRequest: null,
});
