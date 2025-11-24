import './test-env.js';
import { describe, expect, it, vi } from 'vitest';
import { RulesEngine } from './rules.engine.js';
import { RuleCompiler } from './rules.compiler.js';
import type { RuleRepository } from './rules.repository.js';
import type { RuleLogWriter } from './rule-logs.repository.js';
import type { RuleEntity } from './rules.types.js';

const baseRule: RuleEntity = {
  id: 'system-rule',
  name: 'System VAT Split',
  scope: 'country',
  region_code: null,
  country_code: 'US',
  subregion_code: null,
  company_id: null,
  bank_scope: 'all',
  bank_account_ids: null,
  direction_filter: 'outflow',
  priority: 0,
  enabled: true,
  version: 1,
  lock_after_set: false,
  metadata: {},
  tier_rank: 3,
  order_weight: 3000,
  scope_key: 'COUNTRY|US',
  published_at: null,
  published_by: null,
  source: 'system',
  created_by_id: 'system',
  updated_by_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  is_deleted: false,
  deleted_at: undefined,
  conditions: {
    fingerprint: 'c'.repeat(64),
    definition: {
      logic: 'all',
      conditions: [
        {
          type: 'signal',
          field: 'likely_split',
          operator: 'is_true',
        },
      ],
    },
    summary_text: null,
    field_usage: null,
  },
  actions: {
    fingerprint: 'd'.repeat(64),
    definition: {
      actions: [
        {
          type: 'apply_template',
          template: 'vat_split',
          params: {
            net_coa_id: '0b1fb519-2a3f-4b83-a5f6-f73f93293464',
            vat_coa_id: '1802b1c3-2ba0-47ed-92ee-f9a026d4ec06',
            vat_rate: 0.05,
          },
        },
      ],
    },
    protected_action_fields: [],
  },
};

const transaction = {
  transaction: {
    companyId: 'company-1',
    transactionId: 'txn-10',
    transactionDate: '2025-01-20',
    bankAccountId: 'bank-10',
    amount: -105,
    direction: 'outflow' as const,
    description: 'VAT purchase',
    metadata: { signals: { likely_split: true } },
  },
  company: {
    companyId: 'company-1',
    regionCode: null,
    countryCode: 'US',
    subregionCode: null,
  },
};

describe('RulesEngine system capabilities', () => {
  const compiler = new RuleCompiler();

  const makeDeps = (rule: RuleEntity) => {
    const fetchApplicableRules = vi.fn().mockResolvedValue([rule]);
    const repository = { fetchApplicableRules } as unknown as RuleRepository;
    const logWriter: RuleLogWriter = {
      persistRunLogs: vi.fn().mockResolvedValue(undefined),
    };
    return { repository, logWriter };
  };

  it('allows system rules to use signals and templates', async () => {
    const { repository, logWriter } = makeDeps(baseRule);
    const engine = new RulesEngine(repository, compiler, logWriter);
    const result = await engine.run(transaction);
    expect(result.status).toBe('applied');
    expect(result.finalState.categorize).toHaveLength(2);
    expect(result.needsReview).toBe(false);
    expect(result.logs[0].status).toBe('success');
  });

  it('rejects tenant rules that use system-only features', async () => {
    const tenantRule = {
      ...baseRule,
      id: 'tenant-rule',
      source: 'company' as const,
    };
    const { repository, logWriter } = makeDeps(tenantRule);
    const engine = new RulesEngine(repository, compiler, logWriter);
    const result = await engine.run(transaction);

    expect(result.status).toBe('error');
    expect(result.needsReview).toBe(true);
    expect(result.logs[0]).toMatchObject({
      status: 'error',
      note: 'compile_failed',
    });
  });
});
