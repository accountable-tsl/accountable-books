import { Worker } from 'bullmq';

import { redis } from '../../../lib/redis.js';
import { logger } from '../../../shared/index.js';
import { RULE_RUNNER_QUEUE_NAME } from './rule-runner.queue.js';
import { runRulesForEnrichedTransaction } from './rule-runner.service.js';

import type { TransactionEnrichedEventData } from '../events/transaction-events.service.js';

export function startRuleRunnerWorker(
  concurrency = Number(process.env.RULE_RUNNER_CONCURRENCY ?? 5),
): Worker<TransactionEnrichedEventData> {
  const worker = new Worker<TransactionEnrichedEventData>(
    RULE_RUNNER_QUEUE_NAME,
    async (job) => {
      await runRulesForEnrichedTransaction(job.data);
    },
    {
      connection: redis,
      concurrency,
    },
  );

  worker.on('completed', (job) => {
    logger.debug(
      {
        jobId: job.id,
        bankTransactionId: job.data.bank_transaction_id,
      },
      'Rule runner job completed',
    );
  });

  worker.on('failed', (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        bankTransactionId: job?.data.bank_transaction_id,
        error: err,
      },
      'Rule runner job failed',
    );
  });

  logger.info({ concurrency }, 'Rule runner worker started');

  return worker;
}
