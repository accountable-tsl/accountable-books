import { scheduleDailyJournalAutoReversalScan } from '../domains/journals/auto-reversal.queue.js';
import { scheduleRecurringTemplateScan } from '../domains/journals/recurring-templates.queue.js';
import { scheduleNightlyAutoExtend } from '../domains/reporting/fiscal-calendar/index.js';
import { scheduleTaskEvaluationSweep } from '../domains/tasks/task-evaluation.queue.js';
import { scheduleDailySyncScan } from '../integrations/banking/jobs/transaction-sync.queue.js';
import { getLogger } from '../shared/utils/logger.js';
import { getJobSchedule } from './schedules.js';

import type { JobSchedule, JobScheduleKey } from './schedules.js';

const logger = getLogger({ component: 'schedule-registry' });

export interface ScheduleDefinition {
  key: string;
  scheduleKey: JobScheduleKey;
  label: string;
  icon?: string;
  critical?: boolean;
  run: (schedule: JobSchedule) => Promise<void>;
}

export const SCHEDULE_REGISTRY: ScheduleDefinition[] = [
  {
    key: 'fiscalAutoExtend',
    scheduleKey: 'fiscalAutoExtend',
    label: 'Fiscal calendar auto-extend',
    icon: '📅',
    critical: true,
    run: async (schedule) => {
      await scheduleNightlyAutoExtend(schedule.cron, schedule.tz);
    },
  },
  {
    key: 'journalAutoReversal',
    scheduleKey: 'journalAutoReversal',
    label: 'Journal auto-reversal scan',
    icon: '🧾',
    run: async (schedule) => {
      await scheduleDailyJournalAutoReversalScan(
        schedule.cron,
        schedule.tz ?? 'UTC',
      );
    },
  },
  {
    key: 'recurringJournalScan',
    scheduleKey: 'recurringJournalScan',
    label: 'Recurring journal template scan',
    icon: '🗓️',
    run: async (schedule) => {
      await scheduleRecurringTemplateScan(schedule.cron, schedule.tz ?? 'UTC');
    },
  },
  {
    key: 'transactionSyncDailyScan',
    scheduleKey: 'transactionSyncDailyScan',
    label: 'Daily transaction sync scan',
    icon: '💳',
    run: async (schedule) => {
      await scheduleDailySyncScan(schedule.cron);
    },
  },
  {
    key: 'taskEvaluationSweep',
    scheduleKey: 'taskEvaluationSweep',
    label: 'Task evaluation sweep',
    run: async (schedule) => {
      await scheduleTaskEvaluationSweep(schedule.cron, schedule.tz ?? 'UTC');
    },
  },
];

export async function startAllSchedules(): Promise<void> {
  logger.info(`🗓️ Starting ${SCHEDULE_REGISTRY.length} schedules...`);

  let started = 0;

  for (const definition of SCHEDULE_REGISTRY) {
    const schedule = getJobSchedule(definition.scheduleKey);
    const icon = definition.icon ?? '🗓️';

    try {
      await definition.run(schedule);
      started += 1;

      logger.info(
        { cron: schedule.cron, tz: schedule.tz },
        `${icon} Scheduled ${definition.label}`,
      );
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          scheduleKey: definition.scheduleKey,
        },
        `❌ Failed to schedule ${definition.label}`,
      );
      if (definition.critical) {
        throw error;
      }
      logger.warn(`⚠️  Continuing without ${definition.label} schedule`);
    }
  }

  logger.info(
    `✅ Scheduled ${started}/${SCHEDULE_REGISTRY.length} schedules successfully`,
  );
}
