import type { BlockerSeverity, TaskTypeCode } from './task-registry.js';

type ConditionBlockTarget = {
  taskType: TaskTypeCode;
  severity: BlockerSeverity;
};

/**
 * Maps each condition-check code to the task types it blocks and with what severity.
 *
 * Period-scoped conditions (uncategorized_transactions, draft_journals, later_periods_closed)
 * apply only to period-scoped tasks for that same period.
 *
 * Company-scoped conditions (disconnected_bank, open_client_queries) apply to all
 * period-scoped tasks for that client as system_condition blockers.
 */
const CONDITION_BLOCK_MAP: Record<string, ConditionBlockTarget[]> = {
  uncategorized_transactions: [
    { taskType: 'prepare_period_for_review', severity: 'warning' },
    { taskType: 'close_period', severity: 'warning' },
  ],
  draft_journals: [
    { taskType: 'prepare_period_for_review', severity: 'hard' },
    { taskType: 'close_period', severity: 'hard' },
  ],
  later_periods_closed: [
    { taskType: 'prepare_period_for_review', severity: 'warning' },
    { taskType: 'close_period', severity: 'warning' },
  ],
  disconnected_bank: [
    { taskType: 'categorize_transactions', severity: 'hard' },
  ],
  open_client_queries: [
    { taskType: 'prepare_period_for_review', severity: 'warning' },
  ],
};

export function getConditionBlockTargets(
  conditionCode: string,
): ReadonlyArray<ConditionBlockTarget> {
  return CONDITION_BLOCK_MAP[conditionCode] ?? [];
}

export function getAllConditionCodes(): string[] {
  return Object.keys(CONDITION_BLOCK_MAP);
}
