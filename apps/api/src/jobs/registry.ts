import type { Queue, Worker } from 'bullmq';

import { balanceRecalcQueue } from '../domains/balances/balance-recalc.queue.js';
import { startBalanceRecalcWorker } from '../domains/balances/index.js';
import { autopostQueue } from '../domains/categorization/autopost/autopost.queue.js';
import { startAutopostWorker } from '../domains/categorization/autopost/autopost.worker.js';
import { enrichmentQueue } from '../domains/categorization/enrichment/enrichment.queue.js';
import {
  startEnrichmentWorker,
  startMLPredictionWorker,
  startRuleRunnerWorker,
} from '../domains/categorization/index.js';
import { mlPredictionQueue } from '../domains/categorization/ml/ml-prediction.queue.js';
import { ruleRunnerQueue } from '../domains/categorization/rules/rule-runner.queue.js';
import { journalAutoReversalQueue } from '../domains/journals/auto-reversal.queue.js';
import { startJournalAutoReversalWorker } from '../domains/journals/auto-reversal.worker.js';
import { fiscalCalendarQueue } from '../domains/reporting/fiscal-calendar/fiscal-calendar.queue.js';
import { startFiscalCalendarWorker } from '../domains/reporting/fiscal-calendar/index.js';
import { emailQueue } from '../features/communications/email/email.queue.js';
import { startEmailWorker } from '../features/communications/email/index.js';
import { startTransactionSyncWorker } from '../integrations/banking/index.js';
import { transactionSyncQueue } from '../integrations/banking/jobs/transaction-sync.queue.js';
import { partitionMaintenanceQueue } from './queues/partition-maintenance.queue.js';
import { startPartitionMaintenanceWorker } from './workers/partition-maintenance.worker.js';

export interface JobDefinition {
  name: string;
  queue: Queue;
  factory: (concurrency?: number) => Worker;
  label: string;
  icon?: string;
  critical?: boolean;
  config?: {
    envVar: string;
    defaultValue: number;
  };
}

export const JOB_REGISTRY: JobDefinition[] = [
  {
    name: 'email',
    queue: emailQueue,
    factory: () => startEmailWorker(),
    label: 'Email worker',
    icon: '📧',
    critical: true,
    config: {
      envVar: 'EMAIL_WORKER_CONCURRENCY',
      defaultValue: 5,
    },
  },
  {
    name: 'transactionSync',
    queue: transactionSyncQueue,
    factory: (concurrency) => startTransactionSyncWorker(concurrency),
    label: 'Transaction sync worker',
    icon: '💳',
    critical: true,
    config: {
      envVar: 'TRANSACTION_SYNC_CONCURRENCY',
      defaultValue: 3,
    },
  },
  {
    name: 'partitionMaintenance',
    queue: partitionMaintenanceQueue,
    factory: () => startPartitionMaintenanceWorker(),
    label: 'Partition maintenance worker',
    icon: '🗂️',
    config: {
      envVar: 'PARTITION_MAINTENANCE_CONCURRENCY',
      defaultValue: 1,
    },
  },
  {
    name: 'balanceRecalc',
    queue: balanceRecalcQueue,
    factory: () => startBalanceRecalcWorker(),
    label: 'Balance recalculation worker',
    icon: '⚖️',
    critical: true,
    config: {
      envVar: 'BALANCE_RECALC_CONCURRENCY',
      defaultValue: 5,
    },
  },
  {
    name: 'fiscalCalendar',
    queue: fiscalCalendarQueue,
    factory: (concurrency) => startFiscalCalendarWorker(concurrency),
    label: 'Fiscal calendar worker',
    icon: '📅',
    critical: true,
    config: {
      envVar: 'FISCAL_CALENDAR_CONCURRENCY',
      defaultValue: 3,
    },
  },
  {
    name: 'enrichment',
    queue: enrichmentQueue,
    factory: () => startEnrichmentWorker(),
    label: 'Enrichment worker',
    icon: '🔍',
    config: {
      envVar: 'ENRICHMENT_WORKER_CONCURRENCY',
      defaultValue: 10,
    },
  },
  {
    name: 'ruleRunner',
    queue: ruleRunnerQueue,
    factory: (concurrency) => startRuleRunnerWorker(concurrency),
    label: 'Rule runner worker',
    icon: '⚙️',
    critical: true,
    config: {
      envVar: 'RULE_RUNNER_CONCURRENCY',
      defaultValue: 5,
    },
  },
  {
    name: 'mlPrediction',
    queue: mlPredictionQueue,
    factory: (concurrency) => startMLPredictionWorker(concurrency),
    label: 'ML prediction worker',
    icon: '🤖',
    config: {
      envVar: 'ML_WORKER_CONCURRENCY',
      defaultValue: 5,
    },
  },
  {
    name: 'autopost',
    queue: autopostQueue,
    factory: () => startAutopostWorker(),
    label: 'Autopost worker',
    icon: '📤',
    config: {
      envVar: 'AUTOPOST_WORKER_CONCURRENCY',
      defaultValue: 5,
    },
  },
  {
    name: 'journalAutoReversal',
    queue: journalAutoReversalQueue,
    factory: (concurrency) => startJournalAutoReversalWorker(concurrency),
    label: 'Journal auto-reversal worker',
    icon: '🧾',
    config: {
      envVar: 'JOURNAL_AUTO_REVERSAL_CONCURRENCY',
      defaultValue: 1,
    },
  },
];

/** All queues in the system - derived from JOB_REGISTRY */
export const ALL_QUEUES = JOB_REGISTRY.map((job) => job.queue);

export type JobName = (typeof JOB_REGISTRY)[number]['name'];

// Backwards compatibility - alias for WORKER_REGISTRY
export const WORKER_REGISTRY = JOB_REGISTRY;
export type WorkerName = JobName;
export type WorkerDefinition = JobDefinition;
