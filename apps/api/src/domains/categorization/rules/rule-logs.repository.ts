import type { Knex } from 'knex';
import { knexClient } from '../../../db/knexClient.js';
import type { RuleLogs } from './rules-db.types.js';
import type { RuleLogDraft, RuleLogPersistContext } from './rule-logs.types.js';

export interface RuleLogWriter {
  persistRunLogs(params: {
    context: RuleLogPersistContext;
    logs: RuleLogDraft[];
    debugLogs?: RuleLogDraft[];
  }): Promise<void>;
}

const RULE_LOGS_TABLE = 'rule_logs';

export class RuleLogRepository implements RuleLogWriter {
  constructor(private readonly knex: Knex = knexClient) {}

  async persistRunLogs(params: {
    context: RuleLogPersistContext;
    logs: RuleLogDraft[];
    debugLogs?: RuleLogDraft[];
  }): Promise<void> {
    const { context, logs, debugLogs } = params;
    const rows = [
      ...this.buildRows(logs, context, false),
      ...this.buildRows(debugLogs ?? [], context, true),
    ];

    if (rows.length === 0) {
      return;
    }

    await this.knex<RuleLogs>(RULE_LOGS_TABLE).insert(rows);
  }

  private buildRows(
    logs: RuleLogDraft[],
    context: RuleLogPersistContext,
    debug: boolean,
  ): Array<Omit<RuleLogs, 'id' | 'executed_at'>> {
    if (!logs.length) {
      return [];
    }

    const { runId, companyId, transactionId, transactionDate } = context;

    return logs.map((log) => ({
      engine_run_id: runId,
      company_id: companyId,
      transaction_id: transactionId,
      transaction_date: transactionDate,
      rule_id: log.ruleId,
      rule_version: log.ruleVersion,
      rule_priority: log.rulePriority,
      rule_scope: log.ruleScope,
      rule_name: log.ruleName,
      condition_fingerprint: log.conditionFingerprint,
      action_fingerprint: log.actionFingerprint,
      matched_conditions: this.wrapTrace(log.matchedConditions),
      applied_actions: this.wrapTrace(log.appliedActions),
      txn_hash_before: null,
      txn_hash_after: null,
      result_state: log.resultState,
      error_message: log.errorMessage ?? null,
      immutable_fields_after_rule: log.immutableFieldsAfterRule ?? null,
      conflicting_field: log.conflictingField ?? null,
      debug_payload: this.buildDebugPayload(log, debug),
      status: log.status,
      duration_ms:
        typeof log.durationMs === 'number' ? Math.round(log.durationMs) : null,
    }));
  }

  private wrapTrace<T>(trace?: T[]): Record<string, T[]> | null {
    if (!trace) {
      return null;
    }
    return { nodes: trace };
  }

  private buildDebugPayload(
    log: RuleLogDraft,
    debug: boolean,
  ): Record<string, unknown> | null {
    if (!debug && !log.note) {
      return null;
    }

    const payload: Record<string, unknown> = {
      debug,
    };

    if (log.note) {
      payload.note = log.note;
    }

    return payload;
  }
}
