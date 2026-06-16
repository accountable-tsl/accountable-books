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

/** Resolve once the client can accept commands (required before RedisStore init). */
export function waitForRedisReady(client: Redis = redis): Promise<void> {
  if (client.status === 'ready') {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      client.off('ready', onReady);
      client.off('error', onError);
    };

    client.once('ready', onReady);
    client.once('error', onError);

    if (client.status === 'wait') {
      void client.connect().catch(onError);
    }
  });
}
