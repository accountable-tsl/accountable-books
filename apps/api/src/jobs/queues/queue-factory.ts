import type { QueueOptions } from 'bullmq';
import { Queue } from 'bullmq';

import { isTest } from '../../config/env.js';
import { redis } from '../../lib/redis.js';

function createNoopQueue<DataType>(name: string): Queue<DataType> {
  const emptyJobs: never[] = [];
  const noopQueue = {
    name,
    async add() {
      return null;
    },
    async getJob() {
      return null;
    },
    async getWaiting() {
      return emptyJobs;
    },
    async getActive() {
      return emptyJobs;
    },
    async getCompleted() {
      return emptyJobs;
    },
    async getFailed() {
      return emptyJobs;
    },
    async getDelayed() {
      return emptyJobs;
    },
    async getWaitingCount() {
      return 0;
    },
    async getActiveCount() {
      return 0;
    },
    async getCompletedCount() {
      return 0;
    },
    async getFailedCount() {
      return 0;
    },
    async getDelayedCount() {
      return 0;
    },
    async clean() {
      return emptyJobs;
    },
    async drain() {},
    async pause() {},
    async resume() {},
    async removeRepeatable() {
      return true;
    },
    async upsertJobScheduler() {
      return null;
    },
    async close() {},
  };

  return noopQueue as unknown as Queue<DataType>;
}

export function createQueue<DataType>(
  name: string,
  options: Omit<QueueOptions, 'connection'> = {},
): Queue<DataType> {
  if (isTest) {
    return createNoopQueue<DataType>(name);
  }

  return new Queue<DataType>(name, {
    connection: redis,
    ...options,
  });
}
