import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import pino from 'pino';

import { knexClient } from '../../../db/knexClient.js';
import { redis } from '../../../lib/redis.js';
import {
  AUTOPOST_QUEUE_NAME,
  autopostJobDataSchema,
} from './autopost.queue.js';
import { postCandidateToLedger } from './autopost.service.js';

import type { CandidateLineDraft } from '../candidates/candidates.types.js';
import type { AutopostJobData } from './autopost.queue.js';

const logger = pino({ name: 'autopost-worker' });

/**
 * Autopost Worker
 *
 * Processes delayed autopost jobs for categorization candidates
 * Checks if candidate was already posted manually before processing
 */

const AUTOPOST_WORKER_OPTIONS = {
  connection: redis,
  concurrency: Number(process.env.AUTOPOST_WORKER_CONCURRENCY) || 5,
  drainDelay: 300, // Wait 5 minutes when queue is empty
  stalledInterval: 300000, // Check stalled jobs every 5 minutes
  maxStalledCount: 2, // Allow 2 retries for stalled jobs
  lockDuration: 120000, // 2 minute job lock
  lockRenewTime: 30000, // Renew lock every 30 seconds
};

/**
 * Process autopost job
 */
async function processAutopostJob(job: Job<AutopostJobData>) {
  const startTime = Date.now();

  logger.info(
    {
      jobId: job.id,
      candidateId: job.data.candidateId,
      companyId: job.data.companyId,
      runId: job.data.runId,
    },
    'Starting autopost job',
  );

  try {
    // Validate job data
    const validation = autopostJobDataSchema.safeParse(job.data);
    if (!validation.success) {
      logger.error(
        { jobId: job.id, issues: validation.error.issues },
        'Autopost job validation failed',
      );
      throw new Error(
        `Invalid job data: ${validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
      );
    }

    const { candidateId, companyId, runId } = validation.data;

    // Fetch candidate with its lines
    const candidate = await knexClient('categorization_candidates')
      .where({ id: candidateId, is_deleted: false })
      .first(
        'id',
        'categorization_task_id',
        'prediction_id',
        'bank_transaction_id',
        'bank_transaction_date',
        'company_id',
        'source',
        'contact_id',
        'contact_type',
        'reference',
        'description',
        'confidence',
        'explanation',
        'metadata',
        'solver_notes',
        'assignee_id',
      );

    if (!candidate) {
      logger.warn(
        { candidateId, jobId: job.id },
        'Candidate not found or deleted, skipping autopost',
      );
      return; // Don't throw - candidate might have been deleted
    }

    // Fetch candidate lines
    const candidateLinesRows = await knexClient(
      'categorization_candidate_lines',
    )
      .where({ candidate_id: candidateId, is_deleted: false })
      .select('*');

    if (candidateLinesRows.length === 0) {
      logger.warn(
        { candidateId, jobId: job.id },
        'Candidate has no lines, skipping autopost',
      );
      return; // Don't throw
    }

    // Convert database rows to CandidateLineDraft format
    const candidateLines: CandidateLineDraft[] = candidateLinesRows.map(
      (line) => ({
        fs_date: line.fs_date,
        transaction_side: line.transaction_side,
        coa_id: line.coa_id,
        project_id: line.project_id ?? null,
        contact_id: line.contact_id ?? null,
        contact_type: line.contact_type ?? null,
        source_currency_id: line.source_currency_id,
        system_exchange_rate: Number(line.system_exchange_rate),
        custom_exchange_rate: Number(line.custom_exchange_rate),
        signed_native_amount: Number(line.signed_native_amount),
        description: line.description ?? null,
        is_bank_leg: line.is_bank_leg,
        split_type: line.split_type ?? null,
        split_value: line.split_value ? Number(line.split_value) : null,
        explanation: line.explanation ?? null,
        metadata: line.metadata ?? null,
      }),
    );

    // Race condition check: Check if already posted
    const bankTransaction = await knexClient('bank_transactions')
      .where({ id: candidate.bank_transaction_id })
      .first('ledger_transaction_id', 'amount', 'bank_account_id', 'date');

    if (!bankTransaction) {
      logger.warn(
        {
          candidateId,
          bankTransactionId: candidate.bank_transaction_id,
          jobId: job.id,
        },
        'Bank transaction not found, skipping autopost',
      );
      return; // Don't throw
    }

    // Check if already posted
    if (bankTransaction.ledger_transaction_id) {
      logger.info(
        {
          candidateId,
          bankTransactionId: candidate.bank_transaction_id,
          ledgerTransactionId: bankTransaction.ledger_transaction_id,
          jobId: job.id,
        },
        'Candidate already posted to ledger, skipping autopost',
      );
      return; // Already posted - this is expected and not an error
    }

    // Get bank account currency ID
    const bankAccount = await knexClient('bank_accounts')
      .where({ id: bankTransaction.bank_account_id })
      .first('currency_id');

    if (!bankAccount?.currency_id) {
      logger.error(
        {
          candidateId,
          bankAccountId: bankTransaction.bank_account_id,
          jobId: job.id,
        },
        'Bank account not found or missing currency, cannot autopost',
      );
      throw new Error('Bank account not found or missing currency');
    }

    // Build CandidateInput object from candidate data
    const candidateInput = {
      source: candidate.source,
      categorization_task_id: candidate.categorization_task_id,
      prediction_id: candidate.prediction_id,
      bank_transaction_id: candidate.bank_transaction_id,
      bank_transaction_date: candidate.bank_transaction_date,
      company_id: candidate.company_id,
      contact_id: candidate.contact_id,
      contact_type: candidate.contact_type,
      reference: candidate.reference,
      description: candidate.description,
      confidence: Number(candidate.confidence),
      explanation: candidate.explanation,
      metadata: candidate.metadata ?? {},
      candidate_lines: candidateLines,
      solver_notes: candidate.solver_notes,
      assignee_id: candidate.assignee_id,
    };

    // Post candidate to ledger
    const result = await postCandidateToLedger({
      candidateInput,
      bankTransaction: {
        id: candidate.bank_transaction_id,
        bankAccountCurrencyId: bankAccount.currency_id,
        transactionValue: Number(bankTransaction.amount),
      },
      candidateId: candidate.id,
      companyId: candidate.company_id,
      runId,
      trx: undefined, // Create new transaction
    });

    if (!result.success) {
      logger.error(
        {
          candidateId,
          error: result.error,
          jobId: job.id,
        },
        'Failed to post candidate to ledger',
      );
      throw new Error(result.error || 'Failed to post candidate to ledger');
    }

    const duration = Date.now() - startTime;
    logger.info(
      {
        candidateId,
        ledgerTransactionId: result.ledgerTransactionId,
        jobId: job.id,
        duration,
      },
      'Autopost job completed successfully',
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        jobId: job.id,
        candidateId: job.data?.candidateId,
        duration,
      },
      'Autopost job failed',
    );

    // Re-throw to trigger retry logic
    throw error;
  }
}

/**
 * Start autopost worker
 */
export function startAutopostWorker(): Worker<AutopostJobData> {
  const worker = new Worker<AutopostJobData>(
    AUTOPOST_QUEUE_NAME,
    processAutopostJob,
    AUTOPOST_WORKER_OPTIONS,
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Autopost job completed');
  });

  worker.on('failed', (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        error: error.message,
        stack: error.stack,
      },
      'Autopost job failed',
    );
  });

  worker.on('error', (error) => {
    logger.error({ error: error.message, stack: error.stack }, 'Worker error');
  });

  logger.info(
    {
      queueName: AUTOPOST_QUEUE_NAME,
      concurrency: AUTOPOST_WORKER_OPTIONS.concurrency,
    },
    'Autopost worker started',
  );

  return worker;
}
