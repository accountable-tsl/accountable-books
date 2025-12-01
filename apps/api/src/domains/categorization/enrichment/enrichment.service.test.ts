import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

vi.mock('../../../db/knexClient.js', () => {
  return {
    knexClient: {
      transaction: vi.fn(),
    },
  };
});

vi.mock('./company-context.service.js', () => ({
  getCompanyContext: vi.fn(),
}));

vi.mock('./resolve-contact.service.js', () => ({
  resolveContactForEnrichment: vi.fn(),
}));

vi.mock('../stats/stats.service.js', () => ({
  getContactStats: vi.fn(),
}));

vi.mock('./enrichment.utils.js', () => ({
  detectPatternSignals: vi.fn(),
  computeTemporalFeatures: vi.fn(),
}));

vi.mock('../../../shared/index.js', () => ({
  generateChecksumSync: vi.fn(() => 'mock-checksum'),
  toYMD: (value: Date | string) => new Date(value).toISOString().slice(0, 10),
}));

import { knexClient } from '../../../db/knexClient.js';
import { getCompanyContext } from './company-context.service.js';
import { resolveContactForEnrichment } from './resolve-contact.service.js';
import { getContactStats } from '../stats/stats.service.js';
import {
  detectPatternSignals,
  computeTemporalFeatures,
} from './enrichment.utils.js';
import { enrichTransaction } from './enrichment.service.js';
import type { Knex } from 'knex';

const fakeTxnRow = {
  bank_transaction_id: 'txn-123',
  bank_transaction_batch_id: null,
  company_id: 'company-1',
  bank_account_id: 'acct-1',
  bank_account_coa_id: 'coa-1',
  bank_account_name: 'Operating',
  bank_account_display_name: 'Operating USD',
  bank_currency_code: 'USD',
  amount_native: '250.00',
  system_exchange_rate: '1',
  transaction_currency_code: 'USD',
  source: 'ingestion',
  description: 'ACH PAYMENT TO VENDOR',
  reference: 'INV-001',
  additional_notes: '',
  payee: 'Vendor Inc',
  contact_type: null,
  date: new Date('2025-01-01'),
  raw_data: { origin: 'test' },
};

const fakeCompanyContext = {
  legal_name: 'Acme Corp',
  display_name: 'Acme',
  type: 'operating_company',
  description: null,
  website: null,
  country_id: 'country-1',
  country_code: 'US',
  industry: 'technology',
  tags: [],
  accounting_basis: 'modified_accrual_basis',
  reporting_framework: 'ifrs',
  reporting_currency_id: 'currency-1',
  reporting_currency_code: 'USD',
  year_end_day: 31,
  year_end_month: 12,
  default_timezone: 'UTC',
  company_settings_checksum: 'checksum-company-settings',
  coa_snapshot_version: 'snapshot-v1',
  coa_snapshot_id: 'coa-snap-1',
  coa_snapshot_checksum: null,
  cached_at: new Date(),
};

const fakeContactResolution = {
  contact_id: 'contact-1',
  contact_name: 'Vendor Inc',
  contact_fingerprint: 'fingerprint-123',
  contact_match_confidence: 'high',
  contact_type: 'vendor',
  global_contact_name: 'Vendor Global',
  global_contact_category_hints: ['software'],
  mcc: null,
};

const fakeContactStats = {
  stats_row_id: 'stats-1',
  stats_replay_seq: 0,
  stats_snapshot_checksum: 'pre-snapshot',
  snapshot_captured_at: '2024-12-15T00:00:00.000Z',
  totals: {
    transaction_count: 5,
    amount_native_sum: 1000,
    // Removed from schema: reporting currency fields
    avg_amount_native: 200,
    stddev_amount_native: 0,
  },
  rolling_30d: {
    transaction_count: 2,
    amount_native_sum: 400,
    // Removed from schema: reporting currency fields
    avg_amount_native: 200,
    stddev_amount_native: 0,
  },
  rolling_90d: {
    transaction_count: 5,
    amount_native_sum: 1000,
    // Removed from schema: reporting currency fields
    avg_amount_native: 200,
    stddev_amount_native: 0,
  },
  last_transaction_id: 'txn-prev',
  last_transaction_date: '2024-12-15',
};

const fakeSignals = {
  likely_trf_btw_accounts: false,
  notes: [],
};

const fakeTemporal = {
  day_of_week: 3,
  day_of_month: 1,
  calendar_month: 1,
  calendar_quarter: 1,
  fiscal_month: 1,
  fiscal_quarter: 1,
  fiscal_period: {
    year_start: '2024-01-01',
    year_end: '2024-12-31',
    quarter_start: '2024-01-01',
    quarter_end: '2024-03-31',
    month_start: '2025-01-01',
    month_end: '2025-01-31',
  },
};

const mockedKnex = knexClient as unknown as {
  transaction: ReturnType<typeof vi.fn>;
};
const mockedGetCompanyContext = getCompanyContext as unknown as ReturnType<
  typeof vi.fn
>;
const mockedResolveContact =
  resolveContactForEnrichment as unknown as ReturnType<typeof vi.fn>;
const mockedGetContactStats = getContactStats as unknown as ReturnType<
  typeof vi.fn
>;
const mockedDetectSignals = detectPatternSignals as unknown as ReturnType<
  typeof vi.fn
>;
const mockedTemporal = computeTemporalFeatures as unknown as ReturnType<
  typeof vi.fn
>;

const setupKnexTransaction = () => {
  const fakeQuery = {
    select: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    join: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(fakeTxnRow),
  };
  const fakeTx = vi.fn().mockReturnValue(fakeQuery);
  mockedKnex.transaction.mockImplementation(async (callback) => {
    return await callback(fakeTx as unknown as Knex.Transaction);
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  setupKnexTransaction();
  mockedGetCompanyContext.mockResolvedValue(fakeCompanyContext);
  mockedResolveContact.mockResolvedValue(fakeContactResolution);
  mockedGetContactStats.mockResolvedValue(fakeContactStats);
  mockedDetectSignals.mockReturnValue(fakeSignals);
  mockedTemporal.mockReturnValue(fakeTemporal);
});

describe('enrichTransaction', () => {
  it('builds an enriched transaction with metadata', async () => {
    const result = await enrichTransaction({
      bankTransactionId: 'txn-123',
      processingContext: 'primary',
      taskSource: 'ingestion',
    });

    expect(result.success).toBe(true);
    expect(result.enrichedTransaction?.raw.date).toBe('2025-01-01');
    expect(
      result.enrichedTransaction?.historical.bank_contact_stats_snapshot
        ?.stats_snapshot_checksum,
    ).toBe('pre-snapshot');
    expect(result.enrichedTransaction?.metadata.source).toBe('ingestion');
    expect(
      result.enrichedTransaction?.historical.bank_contact_stats_snapshot
        ?.as_of_transaction_id,
    ).toBe('txn-123');
  });

  it('writes the latest enriched transaction snapshot to disk', async () => {
    const result = await enrichTransaction({
      bankTransactionId: 'txn-123',
      processingContext: 'primary',
      taskSource: 'ingestion',
    });
    expect(result.enrichedTransaction).toBeTruthy();

    const fixturesDir = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '__fixtures__',
    );
    mkdirSync(fixturesDir, { recursive: true });
    const fixturePath = path.join(
      fixturesDir,
      'latest-enriched-transaction.json',
    );

    writeFileSync(
      fixturePath,
      JSON.stringify(result.enrichedTransaction, null, 2),
      'utf8',
    );

    const persisted = JSON.parse(readFileSync(fixturePath, 'utf8'));
    expect(persisted.raw.date).toBe('2025-01-01');
    expect(persisted.metadata.enrichment_version).toBe('v260101-01-1.0.0');
  });
});
