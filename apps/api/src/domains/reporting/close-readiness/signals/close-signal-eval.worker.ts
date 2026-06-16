import type { Job } from 'bullmq';
import { Worker } from 'bullmq';

import { redis } from '../../../../lib/redis.js';
import { runWithJobContext } from '../../../../shared/telemetry/request-context.js';
import { getLogger } from '../../../../shared/utils/logger.js';
import {
  closeSignalEvalJobDataSchema,
  type CloseSignalEvalJobData,
} from './close-signal-eval.queue.js';
import { syncLedgerTransactionSignals } from './close-signals.sync.js';

const logger = getLogger({
  component: 'close-signal-eval-worker',
  processSource: 'worker',
});

const DEFAULT_CONCURRENCY = 3;

async function processCloseSignalEvalJob(
  job: Job<CloseSignalEvalJobData>,
): Promise<void> {
  const v = closeSignalEvalJobDataSchema.safeParse(job.data);
  if (!v.success) {
    throw new Error(
      v.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }

  const { companyId, ledgerTransactionId } = v.data;
  const result = await syncLedgerTransactionSignals(ledgerTransactionId);

  logger.info(
    {
      jobId: job.id,
      companyId,
      ledgerTransactionId,
      persisted: result.persisted,
      removed: result.removed,
    },
    'Close signal evaluation completed',
  );
}

export function startCloseSignalEvalWorker(
  concurrency = DEFAULT_CONCURRENCY,
): Worker<CloseSignalEvalJobData> {
  const worker = new Worker<CloseSignalEvalJobData>(
    'close-signal-eval',
    (job) => runWithJobContext(job, () => processCloseSignalEvalJob(job)),
    {
      connection: redis,
      concurrency,
      drainDelay: 300,
      stalledInterval: 60000,
      maxStalledCount: 2,
      lockDuration: 60000,
      lockRenewTime: 30000,
    },
  );

  worker.on('failed', (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        ledgerTransactionId: job?.data?.ledgerTransactionId,
        error: error.message,
      },
      'Close signal evaluation job failed',
    );
  });

  worker.on('error', (error) => {
    logger.error({ error: error.message }, 'Close signal eval worker error');
  });

  return worker;
}
