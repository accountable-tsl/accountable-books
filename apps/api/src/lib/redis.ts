import { Redis } from 'ioredis';

import {
  resolveRedisUrl,
  selectRedisDatabase,
} from '../../config/redis-url.js';
import { resolveVitestWorkerId } from '../../config/test-worker-sandbox.js';
import { isTest } from '../config/env.js';

const url = resolveRedisUrl();
// Keep module import side-effect free; misconfigured Redis should fail on use.
const fallbackRedisUrl = 'redis://127.0.0.1:1';
const testWorkerId = isTest ? resolveVitestWorkerId() : null;
const redisUrl =
  url && testWorkerId ? selectRedisDatabase(url, testWorkerId) : url;

export const redis = new Redis(redisUrl ?? fallbackRedisUrl, {
  enableOfflineQueue: false,
  lazyConnect: !redisUrl,
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
