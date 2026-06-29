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
import { recurringTemplatesQueue } from '../domains/journals/recurring-templates.queue.js';
import { startRecurringTemplatesWorker } from '../domains/journals/recurring-templates.worker.js';
import { OUTBOX_LANE } from '../domains/outbox/outbox.lanes.js';
import {
  outboxDispatchQueue,
  outboxHeavyDispatchQueue,
} from '../domains/outbox/outbox.queue.js';
import {
  closeOutboxSchedulers,
  startOutboxDispatchWorker,
} from '../domains/outbox/outbox.worker.js';
import { closeSignalEvalQueue } from '../domains/reporting/close-readiness/signals/close-signal-eval.queue.js';
import { startCloseSignalEvalWorker } from '../domains/reporting/close-readiness/signals/close-signal-eval.worker.js';
import { fiscalCalendarQueue } from '../domains/reporting/fiscal-calendar/fiscal-calendar.queue.js';
import { startFiscalCalendarWorker } from '../domains/reporting/fiscal-calendar/index.js';
import { taskEvaluationQueue } from '../domains/tasks/task-evaluation.queue.js';
import { startTaskEvaluationWorker } from '../domains/tasks/task-evaluation.worker.js';
import {
  closeCommsSchedulers,
  commsDispatchQueue,
  startCommsDispatchWorker,
} from '../features/comms/index.js';
import { emailQueue } from '../features/communications/email/email.queue.js';
import { startEmailWorker } from '../features/communications/email/index.js';
import {
  closeTransactionSyncScheduler,
  startTransactionSyncWorker,
} from '../integrations/banking/index.js';
import { transactionSyncQueue } from '../integrations/banking/jobs/transaction-sync.queue.js';

export interface JobDefinition {
  name: string;
  queue: Queue;
  factory: (concurrency?: number) => Worker;
  /** Extra async cleanup called by stopAllWorkers after worker.close() */
  teardown?: () => Promise<void>;
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
    name: 'commsDispatch',
    queue: commsDispatchQueue,
    factory: (concurrency) => startCommsDispatchWorker(concurrency),
    teardown: closeCommsSchedulers,
    label: 'Comms dispatch worker',
    critical: true,
    config: {
      envVar: 'COMMS_DISPATCH_CONCURRENCY',
      defaultValue: 5,
    },
  },
  {
    name: 'transactionSync',
    queue: transactionSyncQueue,
    factory: (concurrency) => startTransactionSyncWorker(concurrency),
    teardown: closeTransactionSyncScheduler,
    label: 'Transaction sync worker',
    icon: '💳',
    critical: true,
    config: {
      envVar: 'TRANSACTION_SYNC_CONCURRENCY',
      defaultValue: 3,
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
  {
    name: 'recurringTemplates',
    queue: recurringTemplatesQueue,
    factory: (concurrency) => startRecurringTemplatesWorker(concurrency),
    label: 'Recurring journal templates worker',
    icon: '🗓️',
    config: {
      envVar: 'RECURRING_TEMPLATES_CONCURRENCY',
      defaultValue: 1,
    },
  },
  {
    name: 'taskEvaluation',
    queue: taskEvaluationQueue,
    factory: (concurrency) => startTaskEvaluationWorker(concurrency),
    label: 'Task evaluation worker',
    config: {
      envVar: 'TASK_EVALUATION_CONCURRENCY',
      defaultValue: 3,
    },
  },
  {
    name: 'closeSignalEval',
    queue: closeSignalEvalQueue,
    factory: (concurrency) => startCloseSignalEvalWorker(concurrency),
    label: 'Close signal evaluation worker',
    icon: '🔎',
    config: {
      envVar: 'CLOSE_SIGNAL_EVAL_CONCURRENCY',
      defaultValue: 3,
    },
  },
  {
    name: 'outboxDispatchFast',
    queue: outboxDispatchQueue,
    factory: (concurrency) =>
      startOutboxDispatchWorker(OUTBOX_LANE.FAST, concurrency),
    teardown: closeOutboxSchedulers,
    label: 'Outbox dispatch worker (fast lane)',
    icon: '📬',
    critical: true,
    config: {
      envVar: 'OUTBOX_DISPATCH_CONCURRENCY',
      defaultValue: 5,
    },
  },
  {
    name: 'outboxDispatchHeavy',
    queue: outboxHeavyDispatchQueue,
    factory: (concurrency) =>
      startOutboxDispatchWorker(OUTBOX_LANE.HEAVY, concurrency),
    label: 'Outbox dispatch worker (heavy lane)',
    icon: '🏋️',
    critical: true,
    config: {
      envVar: 'OUTBOX_HEAVY_DISPATCH_CONCURRENCY',
      defaultValue: 2,
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
