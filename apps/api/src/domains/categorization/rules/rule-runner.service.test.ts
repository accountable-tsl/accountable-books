import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TransactionEnrichedEventData } from '../events/transaction-events.service.js';
import {
  buildRuleEngineInput,
  runRulesForEnrichedTransaction,
} from './rule-runner.service.js';
import type { RuleEngineResult } from './rules.engine.js';
import type { CandidateRepository } from '../candidates/candidates.repository.js';
import type { PredictionRepository } from '../predictions/predictions.repository.js';

vi.mock('../ml/ml-prediction.queue.js', () => ({
  enqueueMLPredictionJob: vi.fn().mockResolvedValue(undefined),
}));

const baseEvent: TransactionEnrichedEventData = {
  company_uuid: 'company-1',
  bank_transaction_id: 'txn-1',
  categorization_task_id: 'task-1',
  enriched_transaction: {
    version: 'v1',
    ids: {
      bank_transaction_id: 'txn-1',
      bank_transaction_batch_id: null,
      company_uuid: 'company-1',
      bank_account_id: 'acct-1',
      bank_account_coa_id: 'coa-1',
      contact_id: null,
      enrichment_job_id: null,
    },
    raw: {
      date: '2025-01-15',
      description: 'January rent',
      amount_native: -1200,
      system_ex_rate: 1,
      amount_reporting: -1200,
      currency_code: 'USD',
      direction: 'outflow',
      source: 'import',
      metadata: {},
    },
    normalized: {
      description: 'January rent',
      description_tokens: ['january', 'rent'],
      contact_name: 'Acme Landlord',
      contact_fingerprint: 'fp-1',
      contact_match_confidence: 'high',
      contact_type: 'vendor',
      normalized_reference: 'INV-100',
      global_contact_name: null,
      global_contact_category_hints: null,
    },
    context: {
      company_uuid: 'company-1',
      type: 'business',
      description: null,
      website: null,
      country_id: 'country-1',
      country_code: 'US',
      industry: 'tech',
      accounting_basis: 'modified_accrual_basis',
      reporting_framework: 'ifrs',
      reporting_currency_id: 'cur-1',
      reporting_currency_code: 'USD',
      default_timezone: 'UTC',
      company_settings_checksum: 'chk',
      coa_snapshot_version: 'v1',
      coa_snapshot_id: 'coa-1',
      coa_snapshot_checksum: undefined,
      cached_at: new Date('2025-01-01T00:00:00Z'),
      company_name: 'Example Co',
    },
    historical: {
      bank_contact_stats_snapshot: null,
    },
    signals: {
      likely_split: false,
      likely_trf_btw_accounts: false,
      notes: [],
    },
    temporal: undefined,
    feedback_summary: undefined,
    metadata: {
      source: 'ingestion',
      enriched_at: new Date('2025-01-15T12:00:00Z').toISOString(),
      enrichment_latency_ms: 1500,
      enrichment_version: 'v1',
      status: 'enriched',
      error_message: null,
      stats_replay_seq: 0,
      stats_snapshot_checksum: null,
    },
  },
};

describe('rule-runner.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds rule engine input from enrichment payload', () => {
    const input = buildRuleEngineInput(baseEvent);
    expect(input.transaction.transactionId).toBe('txn-1');
    expect(input.transaction.amount).toBe(-1200);
    expect(input.transaction.description).toBe('January rent');
    expect(input.company.countryCode).toBe('US');
  });

  it('runs rules and persists outcome metadata', async () => {
    const knexStub = createKnexStub();
    const candidateRepo = createCandidateRepoStub();
    const predictionRepo = createPredictionRepoStub();
    const processPredictionToCandidate = vi.fn().mockResolvedValue({
      predictionId: 'pred-1',
      candidateId: 'candidate-1',
      violations: [],
      skipped: false,
    });
    const fakeResult: RuleEngineResult = {
      runId: 'run-1',
      transactionId: 'txn-1',
      transactionDate: '2025-01-15',
      logs: [],
      finalState: {
        description: 'Office Rent',
        categorize: [
          {
            split_type: 'amount',
            description: 'Office Rent',
            coa_id: 'coa-expense',
            value: 1200,
          },
        ],
      },
      status: 'applied',
      needsReview: false,
      winningRuleId: 'rule-1',
      conflictingField: null,
    };

    await runRulesForEnrichedTransaction(baseEvent, {
      runEngine: vi.fn().mockResolvedValue(fakeResult),
      knex: knexStub.knex,
      candidateRepository: candidateRepo,
      predictionRepository: predictionRepo,
      processPredictionToCandidate,
    });

    expect(knexStub.transaction).toHaveBeenCalled();
    expect(knexStub.where).toHaveBeenCalledWith({ id: 'task-1' });
    expect(knexStub.update).toHaveBeenCalledTimes(1);
    const updatePayload = knexStub.update.mock.calls[0][0];
    expect(updatePayload.status).toBe('pending');
    expect(updatePayload.metadata.sql).toContain('jsonb_set');
    expect(processPredictionToCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        categorizationTaskId: 'task-1',
        source: 'rule',
      }),
    );
    expect(predictionRepo.softDeleteByTask).not.toHaveBeenCalled();
    expect(predictionRepo.createPredictionWithLines).not.toHaveBeenCalled();
    expect(candidateRepo.findActiveByTask).not.toHaveBeenCalled();
    expect(candidateRepo.createCandidateWithLines).not.toHaveBeenCalled();
  });

  it('skips candidate creation when engine has no categorize lines', async () => {
    const knexStub = createKnexStub();
    const candidateRepo = createCandidateRepoStub();
    const predictionRepo = createPredictionRepoStub();
    const processPredictionToCandidate = vi.fn().mockResolvedValue({
      predictionId: 'pred-1',
      candidateId: 'candidate-1',
      violations: [],
      skipped: false,
    });
    const fakeResult: RuleEngineResult = {
      runId: 'run-2',
      transactionId: 'txn-1',
      transactionDate: '2025-01-15',
      logs: [],
      finalState: { description: 'Office Rent' },
      status: 'applied',
      needsReview: false,
      winningRuleId: undefined,
      conflictingField: null,
    };

    await runRulesForEnrichedTransaction(baseEvent, {
      runEngine: vi.fn().mockResolvedValue(fakeResult),
      knex: knexStub.knex,
      candidateRepository: candidateRepo,
      predictionRepository: predictionRepo,
      processPredictionToCandidate,
    });

    expect(processPredictionToCandidate).not.toHaveBeenCalled();
    expect(predictionRepo.createPredictionWithLines).not.toHaveBeenCalled();
    expect(candidateRepo.createCandidateWithLines).not.toHaveBeenCalled();
  });

  it('keeps posted candidate and skips creating a new one', async () => {
    const knexStub = createKnexStub();
    const candidateRepo = createCandidateRepoStub({
      findActiveByTaskReturn: [
        { id: 'cand-1', status: 'posted', source: 'rule' },
      ],
    });
    const predictionRepo = createPredictionRepoStub();
    const processPredictionToCandidate = vi.fn().mockResolvedValue({
      predictionId: 'pred-1',
      candidateId: undefined,
      violations: [],
      skipped: true,
      skipReason: 'posted_candidate_exists',
    });
    const fakeResult: RuleEngineResult = {
      runId: 'run-3',
      transactionId: 'txn-1',
      transactionDate: '2025-01-15',
      logs: [],
      finalState: {
        description: 'Office Rent',
        categorize: [
          {
            split_type: 'amount',
            description: 'Office Rent',
            coa_id: 'coa-expense',
            value: 1200,
          },
        ],
      },
      status: 'applied',
      needsReview: false,
      winningRuleId: 'rule-1',
      conflictingField: null,
    };

    await runRulesForEnrichedTransaction(baseEvent, {
      runEngine: vi.fn().mockResolvedValue(fakeResult),
      knex: knexStub.knex,
      candidateRepository: candidateRepo,
      predictionRepository: predictionRepo,
      processPredictionToCandidate,
    });

    expect(processPredictionToCandidate).toHaveBeenCalled();
    expect(predictionRepo.createPredictionWithLines).not.toHaveBeenCalled();
    expect(candidateRepo.createCandidateWithLines).not.toHaveBeenCalled();
  });

  it('marks task as failed when the engine throws', async () => {
    const knexStub = createKnexStub();
    const candidateRepo = createCandidateRepoStub();
    const predictionRepo = createPredictionRepoStub();
    const processPredictionToCandidate = vi.fn();
    await expect(
      runRulesForEnrichedTransaction(baseEvent, {
        runEngine: vi.fn().mockRejectedValue(new Error('boom')),
        knex: knexStub.knex,
        candidateRepository: candidateRepo,
        predictionRepository: predictionRepo,
        processPredictionToCandidate,
      }),
    ).rejects.toThrow('boom');

    const updatePayload = knexStub.update.mock.calls.at(-1)![0];
    expect(updatePayload.status).toBe('failed');
    expect(predictionRepo.createPredictionWithLines).not.toHaveBeenCalled();
    expect(candidateRepo.createCandidateWithLines).not.toHaveBeenCalled();
  });
});

function createKnexStub() {
  const update = vi.fn();
  const where = vi.fn(() => ({ update }));
  const raw = vi.fn((sql: string, bindings: unknown[]) => ({ sql, bindings }));
  const now = vi.fn(() => 'now');
  const makeBuilder = () => ({ where });
  const knexFn: any = () => makeBuilder();
  knexFn.raw = raw;
  knexFn.fn = { now };
  const transaction = vi.fn(async (handler: (trx: any) => Promise<void>) => {
    const trx: any = () => makeBuilder();
    trx.raw = raw;
    trx.fn = { now };
    await handler(trx);
  });
  knexFn.transaction = transaction;
  return { knex: knexFn, update, where, raw, now, transaction };
}

function createCandidateRepoStub(
  options: {
    findActiveByTaskReturn?: Array<{
      id: string;
      status: string;
      source: 'rule' | 'ml';
    }>;
  } = {},
) {
  const findActiveByTask = vi
    .fn()
    .mockResolvedValue(options.findActiveByTaskReturn ?? []);
  const softDeleteByIds = vi.fn().mockResolvedValue(0);
  return {
    findActiveByTask,
    softDeleteByIds,
    createCandidateWithLines: vi.fn().mockResolvedValue('candidate-1'),
  } as unknown as CandidateRepository;
}

function createPredictionRepoStub() {
  return {
    softDeleteByTask: vi.fn().mockResolvedValue(0),
    createPredictionWithLines: vi.fn().mockResolvedValue('prediction-1'),
  } as unknown as PredictionRepository;
}
