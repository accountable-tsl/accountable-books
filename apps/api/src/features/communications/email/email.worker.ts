import { Worker } from 'bullmq';
import { ENV } from '../../../config/env.js';
import {
  type InviteEmailPayload,
  type TokenBasedEmailPayload,
} from './email.types.js';
import { redis } from '../../../lib/redis.js';
import {
  getUserInviteTemplate,
  getVerifyEmailTemplate,
} from './email-templates.js';
import { sendEmail } from './email.service.js';

const baseUrl = ENV.BACKEND_URL;
if (!redis) throw new Error('Missing redis connection');

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
  const worker = new Worker('email', processEmailJob, EMAIL_WORKER_OPTIONS);

  // Logging for observability
  worker.on('completed', (job) => {
    console.log(`Email job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Email job ${job?.id} failed: ${err.message}`);
  });

  worker.on('ready', () => {
    console.log('Email worker ready with optimized Redis settings');
  });

  worker.on('error', (err) => {
    console.error('Email worker error:', err);
  });

  // Graceful shutdown handling
  process.on('SIGTERM', async () => {
    console.log('Shutting down email worker...');
    await worker.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Shutting down email worker...');
    await worker.close();
    process.exit(0);
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
  console.log('Starting email worker directly...');
  emailWorkerInstance = startEmailWorker();
}
