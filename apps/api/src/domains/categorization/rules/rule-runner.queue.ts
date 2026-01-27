import type { JobsOptions } from 'bullmq';
import { Queue } from 'bullmq';

import {
  executeQueueOperation,
  QueueName,
} from '../../../jobs/queues/queue-broker.js';
import { redis } from '../../../lib/redis.js';

import type { TransactionEnrichedEventData } from '../events/transaction-events.service.js';

export const RULE_RUNNER_QUEUE_NAME = 'rule-runner';

const defaultJobOptions: JobsOptions = {
  attempts: Number(process.env.RULE_RUNNER_ATTEMPTS ?? 5),
  backoff: {
    type: 'exponential',
    delay: Number(process.env.RULE_RUNNER_BACKOFF_MS ?? 5000),
  },
  removeOnComplete: { age: 86400, count: 500 }, // keep for 24h
  removeOnFail: { age: 172800, count: 500 },
};

export const ruleRunnerQueue = new Queue<TransactionEnrichedEventData>(
  RULE_RUNNER_QUEUE_NAME,
  {
    connection: redis,
    defaultJobOptions: defaultJobOptions,
  },
);

export async function enqueueRuleRunJob(
  data: TransactionEnrichedEventData,
): Promise<void> {
  // Build a deterministic job id so the queue can deduplicate/recover retries.
  // Prefer `categorization_task_id` (per-task id), fallback to `bank_transaction_id`.
  const jobIdBase =
    data.categorization_task_id ?? data.bank_transaction_id ?? undefined;
  const jobId = jobIdBase
    ? `${data.company_uuid ?? 'company'}-${jobIdBase}`
    : undefined;

  const jobOptions: JobsOptions = jobId
    ? { ...defaultJobOptions, jobId }
    : defaultJobOptions;

  await executeQueueOperation(QueueName.RULE_RUNNER, () =>
    ruleRunnerQueue.add('run-rule', data, jobOptions),
  );
}
