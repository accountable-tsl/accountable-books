import { Worker } from 'bullmq';

import { ENV } from '../../../config/env.js';
import { redis } from '../../../lib/redis.js';
import { runWithJobContext } from '../../../shared/telemetry/request-context.js';
import { getLogger } from '../../../shared/utils/logger.js';
import { RULE_RUNNER_QUEUE_NAME } from './rule-runner.queue.js';
import { runRulesForEnrichedTransaction } from './rule-runner.service.js';

import type { TransactionEnrichedEventData } from '../events/transaction-events.service.js';

const logger = getLogger({
  component: 'rule-runner-worker',
  processSource: 'worker',
});

export function startRuleRunnerWorker(
  concurrency = Number(ENV.RULE_RUNNER_CONCURRENCY ?? 5),
): Worker<TransactionEnrichedEventData> {
  const worker = new Worker<TransactionEnrichedEventData>(
    RULE_RUNNER_QUEUE_NAME,
    (job) =>
      runWithJobContext(job, async () => {
        await runRulesForEnrichedTransaction(job.data);
      }),
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
