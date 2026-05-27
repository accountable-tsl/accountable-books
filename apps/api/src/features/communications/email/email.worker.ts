import { Worker } from 'bullmq';

import { ENV } from '../../../config/env.js';
import { redis } from '../../../lib/redis.js';
import { runWithJobContext } from '../../../shared/telemetry/request-context.js';
import { getLogger } from '../../../shared/utils/logger.js';
import {
  getUserInviteTemplate,
  getVerifyEmailTemplate,
} from './email-templates.js';
import { sendEmail } from './email.service.js';
import {
  type InviteEmailPayload,
  type TokenBasedEmailPayload,
} from './email.types.js';

const baseUrl = ENV.BACKEND_URL;
if (!redis) throw new Error('Missing redis connection');
const logger = getLogger({
  component: 'email-worker',
  processSource: 'worker',
});

// Optimized worker settings to reduce Redis polling by 95%+
const EMAIL_WORKER_OPTIONS = {
  connection: redis,
  concurrency: 5,
  // Dramatically reduce Redis polling frequency
  drainDelay: 300, // Wait 5 minutes when queue is empty (was ~5 seconds)
  stalledInterval: 300000, // Check stalled jobs every 5 min (was 30 seconds)
  maxStalledCount: 1, // Reduce retry attempts for stalled jobs
  lockDuration: 30000, // 30 second job lock
  lockRenewTime: 15000, // Renew lock every 15 seconds
};

// Email job processor function
async function processEmailJob(job: any) {
  switch (job.name) {
    case 'send_verification_email': {
      const payload: TokenBasedEmailPayload & { url: string } = job.data;

      if (!payload.url)
        throw new Error('Missing url @ send_verification_email');

      const url =
        payload.url ?? `${baseUrl}/auth/verify-email?token=${payload.token}`;

      const { subject, html, text } = getVerifyEmailTemplate(payload.name, url);

      await sendEmail({
        to: payload.to,
        subject,
        html,
        text,
      });

      break;
    }

    case 'send_user_invite_email': {
      const payload: InviteEmailPayload = job.data;

      if (!payload.url) throw new Error('Missing url');

      const { subject, html } = getUserInviteTemplate(
        payload.url,
        payload.invitedByUser,
        payload.invitedByOrg,
      );

      await sendEmail({
        to: payload.to,
        subject,
        html,
      });

      break;
    }

    default:
      throw new Error(`Unknown job name: ${job.name}`);
  }
}

// Worker startup function
export function startEmailWorker() {
  const worker = new Worker(
    'email',
    (job) => runWithJobContext(job, () => processEmailJob(job)),
    EMAIL_WORKER_OPTIONS,
  );

  // Logging for observability
  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, jobName: job.name }, 'Email job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, jobName: job?.name, error: err },
      'Email job failed',
    );
  });

  worker.on('ready', () => {
    logger.info('Email worker ready with optimized Redis settings');
  });

  worker.on('error', (err) => {
    logger.error({ error: err }, 'Email worker error');
  });

  return worker;
}

// Export for backwards compatibility and metrics
let emailWorkerInstance: Worker | null = null;

export function getEmailWorker() {
  return emailWorkerInstance;
}

export function getEmailWorkerMetrics() {
  if (!emailWorkerInstance) return null;

  return {
    isRunning: emailWorkerInstance.isRunning(),
    isPaused: emailWorkerInstance.isPaused(),
    concurrency: emailWorkerInstance.concurrency,
  };
}

// Only start worker if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  logger.info('Starting email worker directly');
  emailWorkerInstance = startEmailWorker();
}
