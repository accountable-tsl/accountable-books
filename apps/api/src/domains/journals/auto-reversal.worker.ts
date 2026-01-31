import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import pino from 'pino';

import { knexClient } from '../../db/knexClient.js';
import { redis } from '../../lib/redis.js';
import { getSystemUser } from '../users/users.model.js';
import { reverseJournalRecord } from './journals.command.js';
import {
  JOURNAL_AUTO_REVERSAL_QUEUE_NAME,
  journalAutoReversalJobDataSchema,
  type JournalAutoReversalJobData,
} from './auto-reversal.queue.js';

const logger = pino({ name: 'journal-auto-reversal-worker' });
const PAGE_SIZE = 200;

function extractApiErrorMessage(result: {
  message?: string;
  error?: unknown;
}): string {
  if (typeof result.error === 'string') return result.error;
  if (result.error && typeof result.error === 'object') {
    const maybe = result.error as Record<string, unknown>;
    if (typeof maybe.error === 'string') return maybe.error;
  }
  return result.message ?? 'Unknown error';
}

function isSkippableReverseError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('already been reversed') ||
    m.includes('journal batch is already voided') ||
    m.includes('journal batch not found')
  );
}

async function shouldSkipReversal(journal: {
  status: string;
  is_deleted: boolean;
  reversed_at: string | null;
  reversal_journal_id: string | null;
  auto_reversal_date: Date | string | null;
}) {
  return (
    journal.is_deleted ||
    journal.status !== 'posted' ||
    journal.reversed_at !== null ||
    journal.reversal_journal_id !== null ||
    !journal.auto_reversal_date
  );
}

async function processSingleAutoReversal(
  data: Extract<JournalAutoReversalJobData, { type: 'reverse-one' }>,
) {
  const journal = await knexClient('journal_batches')
    .where('id', data.journalBatchId)
    .select(
      'id',
      'company_id',
      'status',
      'is_deleted',
      'reversed_at',
      'reversal_journal_id',
      'auto_reversal_date',
    )
    .first();

  if (!journal) {
    logger.warn({ journalBatchId: data.journalBatchId }, 'Journal not found');
    return;
  }

  if (await shouldSkipReversal(journal)) {
    logger.info(
      { journalBatchId: journal.id },
      'Journal not eligible for auto-reversal',
    );
    return;
  }

  const systemUser = await getSystemUser({ deterministic: true });
  const reversalDate =
    data.reversalDate ?? journal.auto_reversal_date ?? undefined;

  const result = await reverseJournalRecord({
    journalBatchId: journal.id,
    // Source of truth is the journal's company_id (UUID).
    companyId: journal.company_id,
    userId: systemUser.id,
    reversalReason: 'auto_reversal',
    reversalDate: reversalDate ? new Date(reversalDate) : undefined,
  });
  if (!result.success) {
    const message = extractApiErrorMessage(result);
    if (isSkippableReverseError(message)) {
      logger.info(
        { journalBatchId: journal.id, error: message },
        'Auto-reversal skipped',
      );
      return;
    }
    throw new Error(message);
  }
}

async function processScanAutoReversals() {
  const systemUser = await getSystemUser({ deterministic: true });

  let processed = 0;
  let reversed = 0;
  let skipped = 0;
  let failed = 0;
  let lastId: string | null = null;

  while (true) {
    const q = knexClient('journal_batches')
      .where('auto_reversal_date', '<=', knexClient.fn.now())
      .where('status', 'posted')
      .where('is_deleted', false)
      .whereNull('reversed_at')
      .whereNull('reversal_journal_id')
      .limit(PAGE_SIZE)
      .orderBy('id', 'asc');

    if (lastId) q.where('id', '>', lastId);

    const due = await q.select('id', 'company_id', 'auto_reversal_date');

    if (due.length === 0) break;
    lastId = due[due.length - 1]!.id;

    processed += due.length;

    for (const journal of due) {
      try {
        const result = await reverseJournalRecord({
          journalBatchId: journal.id,
          companyId: journal.company_id,
          userId: systemUser.id,
          reversalReason: 'auto_reversal',
          reversalDate: journal.auto_reversal_date
            ? new Date(journal.auto_reversal_date)
            : undefined,
        });
        if (result.success) {
          reversed += 1;
          continue;
        }

        const message = extractApiErrorMessage(result);
        if (isSkippableReverseError(message)) {
          skipped += 1;
          continue;
        }

        failed += 1;
        logger.error(
          { journalBatchId: journal.id, companyId: journal.company_id, error: message },
          'Auto-reversal failed',
        );
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
          { journalBatchId: journal.id, companyId: journal.company_id, error: message },
          'Auto-reversal failed',
        );
      }
    }
  }

  logger.info(
    { processed, reversed, skipped, failed },
    'Auto-reversal scan completed',
  );
}

async function processAutoReversalJob(
  job: Job<JournalAutoReversalJobData>,
) {
  const validation = journalAutoReversalJobDataSchema.safeParse(job.data);
  if (!validation.success) {
    logger.error(
      { jobId: job.id, issues: validation.error.issues },
      'Invalid auto-reversal job data',
    );
    throw new Error(
      `Invalid auto-reversal job data: ${validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
    );
  }

  const data = validation.data;
  logger.info({ jobId: job.id, type: data.type }, 'Starting auto-reversal job');

  if (data.type === 'reverse-one') {
    await processSingleAutoReversal(data);
    return;
  }

  await processScanAutoReversals();
}

export function startJournalAutoReversalWorker(
  concurrency = Number(process.env.JOURNAL_AUTO_REVERSAL_CONCURRENCY) || 1,
): Worker {
  const worker = new Worker(
    JOURNAL_AUTO_REVERSAL_QUEUE_NAME,
    processAutoReversalJob,
    {
      connection: redis,
      concurrency,
      drainDelay: 300,
      stalledInterval: 300000,
      maxStalledCount: 2,
      lockDuration: 120000,
      lockRenewTime: 30000,
    },
  );

  worker.on('ready', () => {
    logger.info('🧾 Journal auto-reversal worker is ready');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, type: job?.data.type, error: err.message },
      'Auto-reversal job failed',
    );
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, 'Auto-reversal worker error');
  });

  return worker;
}
