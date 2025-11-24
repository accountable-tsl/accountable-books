import { describe, it, expect, vi } from 'vitest';
import type { Knex } from 'knex';
import { RuleLogRepository } from './rule-logs.repository.js';
import type { RuleLogDraft } from './rule-logs.types.js';

const conditionFingerprint = 'c'.repeat(64);
const actionFingerprint = 'd'.repeat(64);

const sampleLog: RuleLogDraft = {
  ruleId: 'rule-1',
  ruleName: 'Sample Rule',
  ruleScope: 'company',
  ruleVersion: 1,
  rulePriority: 0,
  conditionFingerprint,
  actionFingerprint,
  status: 'success',
  matchedConditions: [
    {
      index: 0,
      kind: 'string',
      field: 'description',
      operator: 'contains',
      expected: 'rent',
      actual: 'rent',
      success: true,
    },
  ],
  appliedActions: [
    {
      type: 'set',
      target: 'description',
      value: 'Office Rent',
    },
  ],
  resultState: { description: 'Office Rent' },
  immutableFieldsAfterRule: ['description'],
  conflictingField: null,
  durationMs: 1.6,
};

const debugLog: RuleLogDraft = {
  ...sampleLog,
  ruleId: 'rule-debug',
  status: 'skipped',
  matchedConditions: [],
  appliedActions: [],
  note: 'direction_mismatch',
};

describe('RuleLogRepository', () => {
  it('transforms drafts into DB rows and inserts them', async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    const knexFn = vi.fn().mockReturnValue({ insert }) as unknown as Knex;
    const repo = new RuleLogRepository(knexFn);

    await repo.persistRunLogs({
      context: {
        runId: 'run-1',
        companyId: 'company-1',
        transactionId: 'txn-1',
        transactionDate: '2025-01-31',
      },
      logs: [sampleLog],
      debugLogs: [debugLog],
    });

    expect(knexFn).toHaveBeenCalledWith('rule_logs');
    expect(insert).toHaveBeenCalledTimes(1);
    const rows = insert.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    const [primaryRow, debugRow] = rows;

    expect(primaryRow).toMatchObject({
      engine_run_id: 'run-1',
      company_id: 'company-1',
      transaction_id: 'txn-1',
      rule_id: 'rule-1',
      status: 'success',
      immutable_fields_after_rule: ['description'],
      matched_conditions: { nodes: sampleLog.matchedConditions },
      applied_actions: { nodes: sampleLog.appliedActions },
      duration_ms: 2,
      debug_payload: null,
    });

    expect(debugRow).toMatchObject({
      rule_id: 'rule-debug',
      status: 'skipped',
      debug_payload: { debug: true, note: 'direction_mismatch' },
    });
  });

  it('skips inserts when there is nothing to persist', async () => {
    const insert = vi.fn();
    const knexFn = vi.fn().mockReturnValue({ insert }) as unknown as Knex;
    const repo = new RuleLogRepository(knexFn);

    await repo.persistRunLogs({
      context: {
        runId: 'run-empty',
        companyId: 'company-1',
        transactionId: 'txn-empty',
        transactionDate: '2025-02-01',
      },
      logs: [],
    });

    expect(knexFn).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
