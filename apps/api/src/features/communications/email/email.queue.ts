import { Queue, type Job } from 'bullmq';
import { redis } from '../../../lib/redis.js';
import { isProd } from '../../../config/env.js';
import {
  executeQueueOperation,
  QueueName,
} from '../../../jobs/queues/queue-broker.js';
import type {
  TokenBasedEmailPayload,
  InviteEmailPayload,
} from './email.types.js';

export const emailQueue = new Queue('email', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: isProd ? { age: 3600, count: 100 } : { count: 10 },
    removeOnFail: isProd ? { age: 86400, count: 500 } : { count: 50 },
  },
});

/**
 * Enqueue verification email job
 * Returns null if queues are disabled (e.g., during tests or seeding)
 */
export async function enqueueVerificationEmail(
  payload: TokenBasedEmailPayload & { url: string },
): Promise<Job | null> {
  return executeQueueOperation(QueueName.EMAIL, () =>
    emailQueue.add('send_verification_email', payload),
  );
}

/**
 * Enqueue user invite email job
 * Returns null if queues are disabled (e.g., during tests or seeding)
 */
export async function enqueueUserInviteEmail(
  payload: InviteEmailPayload & { url: string },
): Promise<Job | null> {
  return executeQueueOperation(QueueName.EMAIL, () =>
    emailQueue.add('send_user_invite_email', payload),
  );
}
