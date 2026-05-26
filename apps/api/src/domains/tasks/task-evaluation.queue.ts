import { Queue } from 'bullmq';

import {
  executeQueueOperation,
  QueueName,
} from '../../jobs/queues/queue-broker.js';
import { redis } from '../../lib/redis.js';
import { withJobTelemetry } from '../../shared/telemetry/request-context.js';

// ── Job data types ───────────────────────────────────────────────────

export type TaskEvaluationJobData =
  | { type: 'evaluate-client'; firmCompanyId: string; clientCompanyId: string }
  | { type: 'sweep' };

// ── Queue ────────────────────────────────────────────────────────────

export const taskEvaluationQueue = new Queue<TaskEvaluationJobData>(
  'task-evaluation',
  {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 3600, count: 200 },
      removeOnFail: { age: 86400, count: 100 },
    },
  },
);

// ── Enqueue helpers ──────────────────────────────────────────────────

export async function enqueueEvaluateClient(
  firmCompanyId: string,
  clientCompanyId: string,
): Promise<string> {
  const jobId = `eval-${clientCompanyId}`;

  const job = await executeQueueOperation(QueueName.TASK_EVALUATION, () =>
    taskEvaluationQueue.add(
      'evaluate-client',
      withJobTelemetry({
        type: 'evaluate-client',
        firmCompanyId,
        clientCompanyId,
      }),
      { jobId },
    ),
  );

  return job?.id ?? 'disabled-job-id';
}

export async function scheduleTaskEvaluationSweep(
  cronPattern = '*/15 * * * *',
  tz = 'UTC',
): Promise<void> {
  await executeQueueOperation(QueueName.TASK_EVALUATION, () =>
    taskEvaluationQueue.add(
      'sweep',
      { type: 'sweep' },
      {
        repeat: { pattern: cronPattern, tz },
        jobId: 'task-eval-sweep-scheduler',
      },
    ),
  );
}
