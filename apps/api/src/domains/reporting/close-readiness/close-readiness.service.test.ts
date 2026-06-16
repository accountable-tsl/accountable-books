import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import { evaluateCloseReadiness } from './close-readiness.service.js';
import { syncLedgerTransactionSignals } from './signals/close-signals.sync.js';

type CloseReadinessFixture = {
  userId: string;
  companyId: string;
  currencyId: string;
  countryId: string;
};

describe('evaluateCloseReadiness', () => {
  let trx: Knex.Transaction;
  let fixture: CloseReadinessFixture;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    fixture = await createFixture(trx);
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('keeps a period in preview state until the company-local month has ended', async () => {
    await insertMonthlyPeriod(trx, {
      companyId: fixture.companyId,
      fiscalYear: 2026,
      periodNumber: 6,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });

    const result = await evaluateCloseReadiness({
      companyId: fixture.companyId,
      period: { fiscalYear: 2026, periodNumber: 6 },
      now: new Date('2026-06-30T22:59:00Z'),
      trx,
    });

    expect(result.state).toBe('preview');
    expect(result.formalCloseAllowed).toBe(false);
    expect(result.stateGateCodes).toEqual([
      'period_not_ended_company_timezone',
    ]);
    expect(result.findings.map((finding) => finding.code)).not.toContain(
      'period_not_ended_company_timezone',
    );
  });

  it('activates close after the company-local period end', async () => {
    await insertMonthlyPeriod(trx, {
      companyId: fixture.companyId,
      fiscalYear: 2026,
      periodNumber: 6,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });

    const result = await evaluateCloseReadiness({
      companyId: fixture.companyId,
      period: { fiscalYear: 2026, periodNumber: 6 },
      now: new Date('2026-06-30T23:01:00Z'),
      trx,
    });

    expect(result.state).toBe('active');
    expect(result.formalCloseAllowed).toBe(true);
    expect(result.stateGateCodes).toEqual([]);
  });

  it('uses company-local dates across DST boundaries', async () => {
    const companyId = await createCompany(trx, {
      fixture,
      timezone: 'America/New_York',
      shortCodePrefix: 'cr-ny',
    });
    await insertMonthlyPeriod(trx, {
      companyId,
      fiscalYear: 2026,
      periodNumber: 3,
      startDate: '2026-03-01',
      endDate: '2026-03-08',
    });

    const beforeLocalMidnight = await evaluateCloseReadiness({
      companyId,
      period: { fiscalYear: 2026, periodNumber: 3 },
      now: new Date('2026-03-09T03:30:00Z'),
      trx,
    });
    const afterLocalMidnight = await evaluateCloseReadiness({
      companyId,
      period: { fiscalYear: 2026, periodNumber: 3 },
      now: new Date('2026-03-09T04:30:00Z'),
      trx,
    });

    expect(beforeLocalMidnight.state).toBe('preview');
    expect(afterLocalMidnight.state).toBe('active');
  });

  it('does not block the first managed period because pre-conversion history is open', async () => {
    const companyId = await createCompany(trx, {
      fixture,
      conversionDate: '2026-06-15',
      shortCodePrefix: 'cr-first',
    });
    await insertMonthlyPeriod(trx, {
      companyId,
      fiscalYear: 2026,
      periodNumber: 5,
      startDate: '2026-05-01',
      endDate: '2026-05-31',
    });
    await insertMonthlyPeriod(trx, {
      companyId,
      fiscalYear: 2026,
      periodNumber: 6,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });

    const result = await evaluateCloseReadiness({
      companyId,
      period: { fiscalYear: 2026, periodNumber: 6 },
      now: new Date('2026-07-01T12:00:00Z'),
      trx,
    });

    expect(result.findings.map((finding) => finding.code)).not.toContain(
      'period_prior_managed_month_open',
    );
  });

  it('blocks close when the prior managed month is open', async () => {
    const companyId = await createCompany(trx, {
      fixture,
      conversionDate: '2026-01-01',
      shortCodePrefix: 'cr-seq',
    });
    await insertMonthlyPeriod(trx, {
      companyId,
      fiscalYear: 2026,
      periodNumber: 5,
      startDate: '2026-05-01',
      endDate: '2026-05-31',
    });
    await insertMonthlyPeriod(trx, {
      companyId,
      fiscalYear: 2026,
      periodNumber: 6,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });

    const result = await evaluateCloseReadiness({
      companyId,
      period: { fiscalYear: 2026, periodNumber: 6 },
      now: new Date('2026-07-01T12:00:00Z'),
      trx,
    });

    expect(result.findings.map((finding) => finding.code)).toContain(
      'period_prior_managed_month_open',
    );
    expect(result.summary.blockerCount).toBeGreaterThan(0);
  });

  it('surfaces uncategorized bank transactions as an objective blocker', async () => {
    await insertMonthlyPeriod(trx, {
      companyId: fixture.companyId,
      fiscalYear: 2026,
      periodNumber: 6,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
    await createUncategorizedBankTransaction(trx, fixture, '2026-06-10');

    const result = await evaluateCloseReadiness({
      companyId: fixture.companyId,
      period: { fiscalYear: 2026, periodNumber: 6 },
      now: new Date('2026-07-01T12:00:00Z'),
      trx,
    });

    expect(result.findings.map((finding) => finding.code)).toContain(
      'uncategorized_transactions_open',
    );
    expect(result.summary.finalConfirmationCount).toBe(2);
  });

  it('surfaces preview-visible readiness findings before formal close is allowed', async () => {
    await insertMonthlyPeriod(trx, {
      companyId: fixture.companyId,
      fiscalYear: 2026,
      periodNumber: 6,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
    await createUncategorizedBankTransaction(trx, fixture, '2026-06-10');

    const result = await evaluateCloseReadiness({
      companyId: fixture.companyId,
      period: { fiscalYear: 2026, periodNumber: 6 },
      now: new Date('2026-06-20T12:00:00Z'),
      trx,
    });

    expect(result.state).toBe('preview');
    expect(result.formalCloseAllowed).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain(
      'uncategorized_transactions_open',
    );
  });

  it('surfaces liability activity as a modified cash required review', async () => {
    await insertMonthlyPeriod(trx, {
      companyId: fixture.companyId,
      fiscalYear: 2026,
      periodNumber: 6,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
    await createLiabilityLedgerActivity(trx, fixture);

    const result = await evaluateCloseReadiness({
      companyId: fixture.companyId,
      period: { fiscalYear: 2026, periodNumber: 6 },
      now: new Date('2026-07-01T12:00:00Z'),
      trx,
    });
    const finding = result.findings.find(
      (candidate) =>
        candidate.code === 'cash_fixed_asset_or_liability_pattern_review',
    );

    expect(finding?.severity).toBe('required_review');
    expect(finding?.relatedAccountTypeKeys).toContain('cl_trade_payable');
    expect(finding?.relatedAccountElementKeys).toContain('current_liabilities');
  });

  it('blocks close when trial balance checks are unbalanced', async () => {
    await insertMonthlyPeriod(trx, {
      companyId: fixture.companyId,
      fiscalYear: 2026,
      periodNumber: 6,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
    const cashCoaId = await createCoa(trx, fixture, {
      accountTypeKey: 'ca_bank',
      name: 'Operating Cash',
      code: '1000',
    });
    await insertPeriodBalance(trx, {
      companyId: fixture.companyId,
      coaId: cashCoaId,
      fiscalYear: 2026,
      periodNumber: 6,
      periodDebits: 100,
      periodCredits: 0,
      closingBalance: 100,
    });

    const result = await evaluateCloseReadiness({
      companyId: fixture.companyId,
      period: { fiscalYear: 2026, periodNumber: 6 },
      now: new Date('2026-07-01T12:00:00Z'),
      trx,
    });
    const finding = result.findings.find(
      (candidate) => candidate.code === 'trial_balance_unbalanced',
    );

    expect(finding?.severity).toBe('blocker');
    expect(finding?.details).toMatchObject({
      movementDifference: '100.000',
      closingDifference: '100.000',
    });
  });

  it('blocks close when GL period balances are missing for posted activity', async () => {
    await insertMonthlyPeriod(trx, {
      companyId: fixture.companyId,
      fiscalYear: 2026,
      periodNumber: 6,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
    await createBalancedRevenueLedgerActivity(trx, fixture);

    const result = await evaluateCloseReadiness({
      companyId: fixture.companyId,
      period: { fiscalYear: 2026, periodNumber: 6 },
      now: new Date('2026-07-01T12:00:00Z'),
      trx,
    });
    const finding = result.findings.find(
      (candidate) => candidate.code === 'gl_balances_stale_or_missing',
    );

    expect(finding?.severity).toBe('blocker');
    expect(finding?.details).toMatchObject({ freshnessStatus: 'missing' });
    expect(finding?.relatedCoaIds.length).toBeGreaterThan(0);
  });

  it('surfaces fallback account activity from synced signals as a required review', async () => {
    await insertMonthlyPeriod(trx, {
      companyId: fixture.companyId,
      fiscalYear: 2026,
      periodNumber: 6,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
    const { fallbackCoaId, ledgerTransactionId } =
      await createFallbackLedgerActivity(trx, fixture);
    await syncLedgerTransactionSignals(ledgerTransactionId, trx);

    const result = await evaluateCloseReadiness({
      companyId: fixture.companyId,
      period: { fiscalYear: 2026, periodNumber: 6 },
      now: new Date('2026-07-01T12:00:00Z'),
      trx,
    });
    const finding = result.findings.find(
      (candidate) => candidate.code === 'suspense_activity_review',
    );

    expect(finding?.severity).toBe('required_review');
    expect(finding?.relatedCoaIds).toContain(fallbackCoaId);
    expect(finding?.relatedAccountTypeKeys).toContain('ca_other');
    expect(finding?.details).toMatchObject({
      source: 'close_review_signals',
    });
  });

  it('blocks close when auto-categorized ledger entries still require review', async () => {
    await insertMonthlyPeriod(trx, {
      companyId: fixture.companyId,
      fiscalYear: 2026,
      periodNumber: 6,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
    const reviewedCoaIds = await createAutoCategorizedLedgerActivity(
      trx,
      fixture,
    );

    const result = await evaluateCloseReadiness({
      companyId: fixture.companyId,
      period: { fiscalYear: 2026, periodNumber: 6 },
      now: new Date('2026-07-01T12:00:00Z'),
      trx,
    });
    const finding = result.findings.find(
      (candidate) => candidate.code === 'required_categorization_reviews_open',
    );

    expect(finding?.severity).toBe('blocker');
    expect(finding?.details).toMatchObject({ unreviewedEntryCount: 2 });
    expect(finding?.relatedCoaIds).toEqual(
      expect.arrayContaining(reviewedCoaIds),
    );
  });

  it('surfaces fixed asset activity as a modified accrual required review', async () => {
    const companyId = await createCompany(trx, {
      fixture,
      accountingBasis: 'modified_accrual_basis',
      shortCodePrefix: 'cr-accrual',
    });
    await insertMonthlyPeriod(trx, {
      companyId,
      fiscalYear: 2026,
      periodNumber: 6,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
    await createFixedAssetLedgerActivity(trx, {
      ...fixture,
      companyId,
    });

    const result = await evaluateCloseReadiness({
      companyId,
      period: { fiscalYear: 2026, periodNumber: 6 },
      now: new Date('2026-07-01T12:00:00Z'),
      trx,
    });
    const finding = result.findings.find(
      (candidate) => candidate.code === 'fixed_asset_depreciation_review',
    );

    expect(finding?.severity).toBe('required_review');
    expect(finding?.relatedAccountTypeKeys).toContain('nca_ppe');
    expect(result.summary.finalConfirmationCount).toBe(4);
  });
});

async function createFixture(
  trx: Knex.Transaction,
): Promise<CloseReadinessFixture> {
  const [user] = await trx('users')
    .insert({
      firstname: 'Close',
      lastname: 'Readiness',
      email: `close-readiness-${randomUUID()}@example.com`,
      user_type: 'regular',
    })
    .returning<{ id: string }[]>('id');
  if (!user) throw new Error('Failed to create test user');

  const currency = await trx('currencies')
    .where({ code: 'USD' })
    .select<{ id: string }[]>('id')
    .first();
  const country = await trx('countries')
    .where({ code: 'US' })
    .select<{ id: string }[]>('id')
    .first();
  if (!currency || !country) {
    throw new Error('Required bootstrap rows not found');
  }

  const companyId = await createCompany(trx, {
    fixture: {
      userId: user.id,
      currencyId: currency.id,
      countryId: country.id,
    },
    shortCodePrefix: 'cr',
  });

  return {
    userId: user.id,
    currencyId: currency.id,
    countryId: country.id,
    companyId,
  };
}

async function createCompany(
  trx: Knex.Transaction,
  {
    fixture,
    timezone = 'Europe/London',
    conversionDate = null,
    accountingBasis = 'modified_cash_basis',
    shortCodePrefix,
  }: {
    fixture: Pick<CloseReadinessFixture, 'userId' | 'currencyId' | 'countryId'>;
    timezone?: string;
    conversionDate?: string | null;
    accountingBasis?: 'modified_cash_basis' | 'modified_accrual_basis';
    shortCodePrefix: string;
  },
): Promise<string> {
  const [company] = await trx('companies')
    .insert({
      legal_name: 'Close Readiness Test Company',
      display_name: 'Close Readiness',
      short_code: `${shortCodePrefix}-${randomUUID().slice(0, 8)}`,
      type: 'business',
      year_end_day: 31,
      year_end_month: 12,
      accounting_basis: accountingBasis,
      country_id: fixture.countryId,
      reporting_currency_id: fixture.currencyId,
      default_timezone: timezone,
      conversion_date: conversionDate,
      created_by_id: fixture.userId,
    })
    .returning<{ id: string }[]>('id');
  if (!company) throw new Error('Failed to create test company');

  return company.id;
}

async function insertMonthlyPeriod(
  trx: Knex.Transaction,
  {
    companyId,
    fiscalYear,
    periodNumber,
    startDate,
    endDate,
    status = 'open',
    userId = null,
  }: {
    companyId: string;
    fiscalYear: number;
    periodNumber: number;
    startDate: string;
    endDate: string;
    status?: 'open' | 'closed';
    userId?: string | null;
  },
): Promise<void> {
  await trx('fiscal_calendar').insert({
    company_id: companyId,
    fiscal_year: fiscalYear,
    period_number: periodNumber,
    period_type: 'monthly',
    start_date: startDate,
    end_date: endDate,
    status,
    ...(status === 'closed'
      ? {
          closed_at: new Date(`${endDate}T23:59:59.000Z`),
          closed_by_id: userId,
        }
      : {}),
  });
}

async function createUncategorizedBankTransaction(
  trx: Knex.Transaction,
  fixture: CloseReadinessFixture,
  transactionDate: string,
): Promise<void> {
  const bankAccountId = await createBankAccount(trx, fixture);
  const [batch] = await trx('bank_transaction_batches')
    .insert({
      bank_account_id: bankAccountId,
      company_id: fixture.companyId,
      start_date: transactionDate,
      end_date: transactionDate,
      source: 'manual_entry',
      fingerprint: `cr-${randomUUID()}`,
      import_row_count: 1,
      created_by_id: fixture.userId,
    })
    .returning<{ id: string }[]>('id');
  if (!batch) throw new Error('Failed to create bank transaction batch');

  await trx('bank_transactions').insert({
    bank_account_id: bankAccountId,
    company_id: fixture.companyId,
    bank_transaction_batch_id: batch.id,
    transaction_date: transactionDate,
    transaction_at: new Date(`${transactionDate}T12:00:00.000Z`),
    amount: -125,
    system_exchange_rate: 1,
    idempotency_key: `cr-${randomUUID()}`,
    created_by_id: fixture.userId,
  });
}

async function createBankAccount(
  trx: Knex.Transaction,
  fixture: CloseReadinessFixture,
): Promise<string> {
  const accountType = await trx('account_types')
    .where({ key: 'ca_bank' })
    .select<{ id: string }[]>('id')
    .first();
  const bank = await trx('banks').select<{ id: string }[]>('id').first();
  if (!accountType || !bank) {
    throw new Error('Required account type or bank row not found');
  }

  const [coa] = await trx('coa')
    .insert({
      company_id: fixture.companyId,
      account_type_id: accountType.id,
      currency_id: fixture.currencyId,
      name: 'Test Cash',
      code: '1000',
      created_by_id: fixture.userId,
    })
    .returning<{ id: string }[]>('id');
  if (!coa) throw new Error('Failed to create test cash COA');

  const [account] = await trx('bank_accounts')
    .insert({
      company_id: fixture.companyId,
      display_name: 'Test Bank Account',
      account_name: 'Test Bank Account',
      account_type: 'checkings_current',
      account_number: `cr-${randomUUID().slice(0, 8)}`,
      business_or_personal: 'business',
      bank_id: bank.id,
      currency_id: fixture.currencyId,
      coa_id: coa.id,
      connection_status: 'not_connected',
      created_by_id: fixture.userId,
      updated_by_id: fixture.userId,
    })
    .returning<{ id: string }[]>('id');
  if (!account) throw new Error('Failed to create test bank account');

  return account.id;
}

async function insertPeriodBalance(
  trx: Knex.Transaction,
  {
    companyId,
    coaId,
    fiscalYear,
    periodNumber,
    periodDebits,
    periodCredits,
    closingBalance,
  }: {
    companyId: string;
    coaId: string;
    fiscalYear: number;
    periodNumber: number;
    periodDebits: number;
    periodCredits: number;
    closingBalance: number;
  },
): Promise<void> {
  await trx('gl_period_balances').insert({
    company_id: companyId,
    coa_id: coaId,
    fiscal_year: fiscalYear,
    period_number: periodNumber,
    period_type: 'monthly',
    opening_balance: 0,
    period_debits: periodDebits,
    period_credits: periodCredits,
    closing_balance: closingBalance,
    transaction_count: 1,
    calculated_at: new Date('2026-06-30T23:59:59.000Z'),
  });
}

async function createBalancedRevenueLedgerActivity(
  trx: Knex.Transaction,
  fixture: CloseReadinessFixture,
): Promise<void> {
  const cashCoaId = await createCoa(trx, fixture, {
    accountTypeKey: 'ca_bank',
    name: 'Operating Cash',
    code: '1000',
  });
  const revenueCoaId = await createCoa(trx, fixture, {
    accountTypeKey: 'rev_revenue',
    name: 'Product Revenue',
    code: '4000',
  });

  await createPostedLedgerTransaction(trx, fixture, [
    {
      coaId: cashCoaId,
      amount: 100,
    },
    {
      coaId: revenueCoaId,
      amount: -100,
    },
  ]);
}

async function createFallbackLedgerActivity(
  trx: Knex.Transaction,
  fixture: CloseReadinessFixture,
): Promise<{ fallbackCoaId: string; ledgerTransactionId: string }> {
  const cashCoaId = await createCoa(trx, fixture, {
    accountTypeKey: 'ca_bank',
    name: 'Operating Cash',
    code: '1000',
  });
  const fallbackCoaId = await createCoa(trx, fixture, {
    accountTypeKey: 'ca_other',
    name: 'Other Current Asset Holding',
    code: '1999',
  });

  // A bank receipt parked in a fallback (label_role = 'fallback') account: the
  // `posted_to_fallback_account` signal fires and is surfaced as
  // `suspense_activity_review` through `mergeOpenSignalFindings`.
  const ledgerTransactionId = await createPostedLedgerTransaction(
    trx,
    fixture,
    [
      { coaId: cashCoaId, amount: 100, isBankLeg: true },
      { coaId: fallbackCoaId, amount: -100 },
    ],
    { transactionSource: 'bank_transaction' },
  );

  return { fallbackCoaId, ledgerTransactionId };
}

async function createAutoCategorizedLedgerActivity(
  trx: Knex.Transaction,
  fixture: CloseReadinessFixture,
): Promise<string[]> {
  const cashCoaId = await createCoa(trx, fixture, {
    accountTypeKey: 'ca_bank',
    name: 'Operating Cash',
    code: '1000',
  });
  const revenueCoaId = await createCoa(trx, fixture, {
    accountTypeKey: 'rev_revenue',
    name: 'Product Revenue',
    code: '4000',
  });

  await createPostedLedgerTransaction(
    trx,
    fixture,
    [
      {
        coaId: cashCoaId,
        amount: 100,
      },
      {
        coaId: revenueCoaId,
        amount: -100,
      },
    ],
    {
      transactionSource: 'bank_transaction',
      categorizationSource: 'ml',
      humanReviewed: false,
    },
  );

  return [cashCoaId, revenueCoaId];
}

async function createLiabilityLedgerActivity(
  trx: Knex.Transaction,
  fixture: CloseReadinessFixture,
): Promise<void> {
  const payableCoaId = await createCoa(trx, fixture, {
    accountTypeKey: 'cl_trade_payable',
    name: 'Trade Payables',
    code: '2100',
  });
  const cashCoaId = await createCoa(trx, fixture, {
    accountTypeKey: 'ca_bank',
    name: 'Cash Clearing',
    code: '1001',
  });

  await createPostedLedgerTransaction(trx, fixture, [
    {
      coaId: payableCoaId,
      amount: -500,
    },
    {
      coaId: cashCoaId,
      amount: 500,
    },
  ]);
}

async function createFixedAssetLedgerActivity(
  trx: Knex.Transaction,
  fixture: CloseReadinessFixture,
): Promise<void> {
  const fixedAssetCoaId = await createCoa(trx, fixture, {
    accountTypeKey: 'nca_ppe',
    name: 'Equipment',
    code: '1500',
  });
  const cashCoaId = await createCoa(trx, fixture, {
    accountTypeKey: 'ca_bank',
    name: 'Cash Clearing',
    code: '1001',
  });

  await createPostedLedgerTransaction(trx, fixture, [
    {
      coaId: fixedAssetCoaId,
      amount: 1000,
    },
    {
      coaId: cashCoaId,
      amount: -1000,
    },
  ]);
}

async function createPostedLedgerTransaction(
  trx: Knex.Transaction,
  fixture: CloseReadinessFixture,
  entries: {
    coaId: string;
    amount: number;
    isBankLeg?: boolean;
  }[],
  options: {
    transactionSource?: 'manual_journal' | 'bank_transaction';
    categorizationSource?: 'manual' | 'rule' | 'ml' | 'ml_heuristic';
    humanReviewed?: boolean;
  } = {},
): Promise<string> {
  const transactionSource = options.transactionSource ?? 'manual_journal';
  const categorizationSource = options.categorizationSource ?? 'manual';

  const [ledgerTransaction] = await trx('ledger_transactions')
    .insert({
      company_id: fixture.companyId,
      transaction_date: '2026-06-10',
      transaction_source: transactionSource,
      categorization_source: categorizationSource,
      description: 'Equipment purchase',
      source_transaction_id: randomUUID(),
      ...(transactionSource === 'bank_transaction'
        ? {
            source_transaction_date: '2026-06-10',
            source_transaction_amount: entries.reduce(
              (sum, entry) => sum + Math.abs(entry.amount),
              0,
            ),
          }
        : {}),
      source_transaction_currency_id: fixture.currencyId,
      created_by_id: fixture.userId,
    })
    .returning<{ id: string }[]>('id');
  if (!ledgerTransaction) {
    throw new Error('Failed to create ledger transaction');
  }

  await trx('ledger_entries').insert(
    entries.map((entry) => ({
      company_id: fixture.companyId,
      ledger_transaction_id: ledgerTransaction.id,
      fs_date: '2026-06-10',
      coa_id: entry.coaId,
      source_currency_id: fixture.currencyId,
      source_amount: entry.amount,
      system_exchange_rate: 1,
      custom_exchange_rate: 1,
      is_bank_leg: entry.isBankLeg ?? false,
      human_reviewed:
        options.humanReviewed ?? categorizationSource === 'manual',
    })),
  );

  return ledgerTransaction.id;
}

async function createCoa(
  trx: Knex.Transaction,
  fixture: CloseReadinessFixture,
  {
    accountTypeKey,
    name,
    code,
  }: {
    accountTypeKey: string;
    name: string;
    code: string;
  },
): Promise<string> {
  const accountType = await trx('account_types')
    .where({ key: accountTypeKey })
    .select<{ id: string }[]>('id')
    .first();
  if (!accountType) {
    throw new Error(`Account type not found: ${accountTypeKey}`);
  }

  const [coa] = await trx('coa')
    .insert({
      company_id: fixture.companyId,
      account_type_id: accountType.id,
      currency_id: fixture.currencyId,
      name,
      code,
      created_by_id: fixture.userId,
    })
    .returning<{ id: string }[]>('id');
  if (!coa) throw new Error(`Failed to create COA ${code}`);

  return coa.id;
}
