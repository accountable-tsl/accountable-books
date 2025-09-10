import { Queue } from 'bullmq';
import { redis } from '../../lib/redis.js';
import { isProd } from '../../config/env.js';

export const emailQueue = new Queue('email', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: isProd ? { age: 3600, count: 100 } : { count: 10 },
    removeOnFail: isProd ? { age: 86400, count: 500 } : { count: 50 },
  },
});
