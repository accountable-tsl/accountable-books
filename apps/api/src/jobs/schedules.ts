/**
 * Cron schedule registry for time-based (repeatable) jobs only.
 * Event-driven queues (email, ML, balance recalc, etc.) are intentionally excluded.
 */
export type JobScheduleKey =
  | 'fiscalAutoExtend'
  | 'journalAutoReversal'
  | 'recurringJournalScan'
  | 'partitionMaintenance'
  | 'partitionDrain'
  | 'transactionSyncDailyScan'
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
  partitionMaintenance: {
    cron: '0 2 * * *',
    envVar: 'PARTITION_MAINTENANCE_CRON',
    description: 'Daily partition maintenance',
    tz: 'UTC',
  },
  partitionDrain: {
    cron: '0 */4 * * *',
    envVar: 'PARTITION_DRAIN_CRON',
    description: 'Drain default partitions every 4 hours',
    tz: 'UTC',
  },
  transactionSyncDailyScan: {
    cron: '0 2 * * *',
    envVar: 'TRANSACTION_SYNC_CRON',
    description: 'Daily transaction sync scan',
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
