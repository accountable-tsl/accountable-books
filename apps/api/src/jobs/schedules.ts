/**
 * Cron schedule registry for time-based (repeatable) jobs only.
 * Event-driven queues (email, ML, balance recalc, etc.) are intentionally excluded.
 */
export type JobScheduleKey =
  | 'fiscalAutoExtend'
  | 'journalAutoReversal'
  | 'recurringJournalScan'
  | 'transactionSyncDailyScan'
  | 'historyImportExpiry'
  | 'bankingRetention'
  | 'taskEvaluationSweep';

export type JobSchedule = {
  cron: string;
  envVar: string;
  description: string;
  tz?: string;
};

const SCHEDULES: Record<JobScheduleKey, JobSchedule> = {
  fiscalAutoExtend: {
    cron: '0 2 * * *',
    envVar: 'FISCAL_AUTO_EXTEND_CRON',
    description: 'Nightly fiscal calendar auto-extend',
    tz: 'UTC',
  },
  journalAutoReversal: {
    cron: '0 3 * * *',
    envVar: 'JOURNAL_AUTO_REVERSAL_CRON',
    description: 'Daily journal auto-reversal scan',
    tz: 'UTC',
  },
  recurringJournalScan: {
    cron: '0 * * * *',
    envVar: 'RECURRING_JOURNAL_SCAN_CRON',
    description: 'Hourly recurring journal template scan',
    tz: 'UTC',
  },
  transactionSyncDailyScan: {
    cron: '0 2 * * *',
    envVar: 'TRANSACTION_SYNC_CRON',
    description: 'Daily transaction sync scan',
    tz: 'UTC',
  },
  historyImportExpiry: {
    cron: '15 2 * * *',
    envVar: 'HISTORY_IMPORT_EXPIRY_CRON',
    description: 'Daily history import expiry and reminder sweep',
    tz: 'UTC',
  },
  bankingRetention: {
    cron: '30 2 * * *',
    envVar: 'BANKING_RETENTION_CRON',
    description: 'Daily banking retention purge (webhook payloads, sync runs)',
    tz: 'UTC',
  },
  taskEvaluationSweep: {
    cron: '*/15 * * * *',
    envVar: 'TASK_EVALUATION_SWEEP_CRON',
    description: 'Task evaluation sweep every 15 min',
    tz: 'UTC',
  },
};

export function getJobSchedule(key: JobScheduleKey): JobSchedule {
  const base = SCHEDULES[key];
  const cron = process.env[base.envVar] || base.cron;
  return { ...base, cron };
}

export function getJobSchedules(): Record<JobScheduleKey, JobSchedule> {
  const entries = Object.entries(SCHEDULES).map(([key, value]) => [
    key,
    {
      ...value,
      cron: process.env[value.envVar] || value.cron,
    },
  ]);

  return Object.fromEntries(entries) as Record<JobScheduleKey, JobSchedule>;
}
