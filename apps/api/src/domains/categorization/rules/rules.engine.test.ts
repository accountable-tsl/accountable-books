import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
  type MockedFunction,
} from 'vitest';
import type { RuleLogPersistContext, RuleLogDraft } from './rule-logs.types.js';

type PersistRunLogsParams = {
  context: RuleLogPersistContext;
  logs: RuleLogDraft[];
  debugLogs?: RuleLogDraft[];
};

vi.mock('./rules.compiler.js', () => {
  class FakeRuleCompiler {
    compileCondition(fingerprint: string, definition: any) {
      const keywords = definition.conditions
        .filter((condition: any) => condition.type === 'string')
        .map((condition: any) => condition.value.toLowerCase());
      return {
        fingerprint,
        evaluate: (txn: any) => {
          const haystack = (txn.description ?? '').toLowerCase();
          const matched =
            keywords.length === 0
              ? true
              : definition.logic === 'all'
                ? keywords.every((kw: string) => haystack.includes(kw))
                : keywords.some((kw: string) => haystack.includes(kw));
          return { matched, trace: [] };
        },
      };
    }

    compileAction(fingerprint: string, definition: any) {
      const touchedFields = definition.actions.map((action: any) =>
        action.type === 'set' ? action.target : 'categorize',
      );
      return {
        fingerprint,
        touchedFields,
        execute: (draft: any) => {
          let nextDraft = { ...draft };
          const effects: any[] = [];
          const trace: any[] = [];
          for (const action of definition.actions) {
            if (action.type === 'set') {
              nextDraft = { ...nextDraft, [action.target]: action.value };
              effects.push({
                type: 'set',
                target: action.target,
                value: action.value,
              });
              trace.push({
                type: 'set',
                target: action.target,
                value: action.value,
              });
            }
          }
          return { nextDraft, effects, trace, touchedFields };
        },
      };
    }
  }

  class FakeRuleCompilerError extends Error {}

  return {
    RuleCompiler: FakeRuleCompiler,
    RuleCompilerError: FakeRuleCompilerError,
  };
});

import { RulesEngine } from './rules.engine.js';
import { RuleCompiler } from './rules.compiler.js';
import type { RuleRepository } from './rules.repository.js';
import type { RuleLogWriter } from './rule-logs.repository.js';
import type { RuleEntity } from './rules.types.js';

const baseConditionFingerprint = 'a'.repeat(64);
const baseActionFingerprint = 'b'.repeat(64);

function buildRule(overrides: Partial<RuleEntity> = {}): RuleEntity {
  return {
    id: overrides.id ?? 'rule-1',
    name: overrides.name ?? 'Rule 1',
    scope: overrides.scope ?? 'company',
    region_code: overrides.region_code ?? null,
    country_code: overrides.country_code ?? null,
    subregion_code: overrides.subregion_code ?? null,
    company_id: overrides.company_id ?? 'company-1',
    bank_scope: overrides.bank_scope ?? 'all',
    bank_account_ids: overrides.bank_account_ids ?? null,
    direction_filter: overrides.direction_filter ?? 'all',
    priority: overrides.priority ?? 0,
    enabled: overrides.enabled ?? true,
    version: overrides.version ?? 1,
    lock_after_set: overrides.lock_after_set ?? false,
    metadata: overrides.metadata ?? {},
    tier_rank: overrides.tier_rank ?? 5,
    order_weight: overrides.order_weight ?? 5000,
    scope_key: overrides.scope_key ?? 'COMPANY|company-1',
    published_at: overrides.published_at ?? null,
    published_by: overrides.published_by ?? null,
    source: overrides.source ?? 'company',
    created_by_id: overrides.created_by_id ?? 'user-1',
    updated_by_id: overrides.updated_by_id ?? null,
    created_at: overrides.created_at ?? new Date().toISOString(),
    updated_at: overrides.updated_at ?? new Date().toISOString(),
    is_deleted: overrides.is_deleted ?? false,
    deleted_at: overrides.deleted_at ?? undefined,
    conditions: overrides.conditions ?? {
      fingerprint: baseConditionFingerprint,
      definition: {
        logic: 'all',
        conditions: [
          {
            type: 'string',
            field: 'description',
            operator: 'contains',
            value: 'rent',
          },
        ],
      },
      summary_text: null,
      field_usage: null,
    },
    actions: overrides.actions ?? {
      fingerprint: baseActionFingerprint,
      definition: {
        actions: [
          {
            type: 'set',
            target: 'description',
            value: 'Office Rent',
          },
        ],
      },
      protected_action_fields: [],
    },
  };
}

describe('RulesEngine', () => {
  let compiler: RuleCompiler;
  let repository: RuleRepository;
  let fetchApplicableRules: ReturnType<typeof vi.fn>;
  let logWriter: RuleLogWriter;

  beforeEach(() => {
    compiler = new RuleCompiler();
    fetchApplicableRules = vi.fn();
    repository = {
      fetchApplicableRules,
    } as unknown as RuleRepository;
    logWriter = {
      persistRunLogs: vi.fn().mockResolvedValue(undefined),
    } as RuleLogWriter;
  });

  it('applies matching rules, locks fields, and persists logs', async () => {
    const matchingRule = buildRule({ lock_after_set: true });
    fetchApplicableRules.mockResolvedValue([matchingRule]);

    const engine = new RulesEngine(repository, compiler, logWriter);
    const result = await engine.run({
      transaction: {
        companyId: 'company-1',
        transactionId: 'txn-1',
        transactionDate: '2025-01-15',
        bankAccountId: 'bank-1',
        amount: 1000,
        direction: 'outflow',
        description: 'January rent payment',
      },
      company: {
        companyId: 'company-1',
        regionCode: null,
        countryCode: 'US',
        subregionCode: null,
      },
      options: {
        debug: false,
      },
    });

    expect(result.status).toBe('applied');
    expect(result.finalState.description).toBe('Office Rent');
    expect(result.winningRuleId).toBe(matchingRule.id);

    expect(logWriter.persistRunLogs).toHaveBeenCalledTimes(1);
    const persistArgs = (logWriter.persistRunLogs as MockedFunction<any>).mock
      .calls[0][0] as PersistRunLogsParams;
    expect(persistArgs.context).toMatchObject({
      companyId: 'company-1',
      transactionId: 'txn-1',
    });
    expect(persistArgs.logs).toHaveLength(1);
    expect(persistArgs.logs[0]).toMatchObject({
      ruleId: matchingRule.id,
      status: 'success',
    });
  });

  it('stops on conflict when a locked field is touched again', async () => {
    const firstRule = buildRule({
      id: 'rule-1',
      lock_after_set: true,
      order_weight: 5000,
    });
    const secondRule = buildRule({
      id: 'rule-2',
      order_weight: 5001,
      actions: {
        fingerprint: 'c'.repeat(64),
        definition: {
          actions: [
            {
              type: 'set',
              target: 'description',
              value: 'Overridden',
            },
          ],
        },
        protected_action_fields: [],
      },
    });

    fetchApplicableRules.mockResolvedValue([firstRule, secondRule]);

    const engine = new RulesEngine(repository, compiler, logWriter);
    const result = await engine.run({
      transaction: {
        companyId: 'company-1',
        transactionId: 'txn-2',
        transactionDate: '2025-01-16',
        amount: 200,
        direction: 'outflow',
        description: 'Another rent payment',
      },
      company: {
        companyId: 'company-1',
      },
    });

    expect(result.status).toBe('conflict');
    expect(result.needsReview).toBe(true);
    expect(result.conflictingField).toBe('description');
    expect(result.finalState.description).toBe('Office Rent');

    const persistArgs = (logWriter.persistRunLogs as MockedFunction<any>).mock
      .calls[0][0] as PersistRunLogsParams;
    expect(persistArgs.logs).toHaveLength(2);
    expect(persistArgs.logs[1]).toMatchObject({
      ruleId: 'rule-2',
      status: 'conflict',
      conflictingField: 'description',
    });
  });

  it('records debug logs for skipped rules when debug mode is on', async () => {
    const unmatchedRule = buildRule({
      id: 'rule-skip',
      direction_filter: 'inflow',
    });
    fetchApplicableRules.mockResolvedValue([unmatchedRule]);

    const engine = new RulesEngine(repository, compiler, logWriter);
    const result = await engine.run({
      transaction: {
        companyId: 'company-1',
        transactionId: 'txn-3',
        transactionDate: '2025-01-17',
        amount: 50,
        direction: 'outflow',
        description: 'Fee',
      },
      company: {
        companyId: 'company-1',
      },
      options: {
        debug: true,
      },
    });

    expect(result.status).toBe('no_match');
    expect(result.logs).toHaveLength(0);
    expect(result.debugLogs).toHaveLength(1);

    const persistArgs = (logWriter.persistRunLogs as MockedFunction<any>).mock
      .calls[0][0] as PersistRunLogsParams;
    expect(persistArgs.logs).toHaveLength(0);
    expect(persistArgs.debugLogs).toHaveLength(1);
    expect(persistArgs.debugLogs?.[0]).toMatchObject({
      ruleId: 'rule-skip',
      status: 'skipped',
      note: 'direction_mismatch',
    });
  });

  it('logs compilation failures but continues evaluating other rules', async () => {
    const failingRule = buildRule({
      id: 'rule-fail',
      conditions: {
        fingerprint: 'c'.repeat(64),
        definition: {
          logic: 'all',
          conditions: [
            {
              type: 'string',
              field: 'description',
              operator: 'contains',
              value: 'rent',
            },
          ],
        },
        summary_text: null,
        field_usage: null,
      },
    });
    const succeedingRule = buildRule({
      id: 'rule-success',
      order_weight: 6000,
      actions: {
        fingerprint: 'd'.repeat(64),
        definition: {
          actions: [
            {
              type: 'set',
              target: 'description',
              value: 'Office Rent',
            },
          ],
        },
        protected_action_fields: [],
      },
    });

    fetchApplicableRules.mockResolvedValue([failingRule, succeedingRule]);

    const baseCompiler = new RuleCompiler();
    const compilerStub = {
      compileCondition: vi.fn(
        (fingerprint: string, definition: any, options: any) => {
          if (fingerprint === failingRule.conditions.fingerprint) {
            throw new Error('bad compile');
          }
          return baseCompiler.compileCondition(
            fingerprint,
            definition,
            options,
          );
        },
      ),
      compileAction: vi.fn((fingerprint: string, definition: any) =>
        baseCompiler.compileAction(fingerprint, definition),
      ),
    } as unknown as RuleCompiler;

    const engine = new RulesEngine(repository, compilerStub, logWriter);
    const result = await engine.run({
      transaction: {
        companyId: 'company-1',
        transactionId: 'txn-5',
        transactionDate: '2025-01-20',
        amount: 500,
        direction: 'outflow',
        description: 'Monthly rent',
      },
      company: {
        companyId: 'company-1',
      },
    });

    expect(result.status).toBe('applied');
    expect(result.needsReview).toBe(true);
    expect(result.winningRuleId).toBe('rule-success');

    const persistArgs = (logWriter.persistRunLogs as MockedFunction<any>).mock
      .calls[0][0] as PersistRunLogsParams;
    expect(persistArgs.logs[0]).toMatchObject({
      ruleId: 'rule-fail',
      status: 'error',
      note: 'compile_failed',
    });
    expect(persistArgs.logs[1]).toMatchObject({
      ruleId: 'rule-success',
      status: 'success',
    });
  });
});
