import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getCurrencyId,
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import {
  checkBankConnectionHealth,
  checkDraftJournals,
  checkLaterPeriodsClosed,
  checkOpenClientQueries,
  checkUncategorizedTransactions,
} from '../condition-checks.js';

import type { PeriodRange } from '../condition-checks.js';

describe('condition-checks', () => {
  let trx: Knex.Transaction;
  let testCompanyId: string;
  let testUserId: string;
  let testBankAccountId: string;
  let testCurrencyId: string;
  let testCoaId: string;
  /** Isolated company id (no demo bank txns or fiscal rows) for tests that need controlled data */
  let isolatedCompanyId: string;
  /** Bank account for isolated company */
  let isolatedBankAccountId: string;
  /** COA id for isolated company (for provider-linked bank account) */
  let isolatedCoaId: string;

  const march2025: PeriodRange = {
    fiscal_calendar_id: '00000000-0000-0000-0000-000000000003',
    start_date: '2025-03-01',
    end_date: '2025-03-31',
    fiscal_year: 2025,
    period_number: 3,
    period_type: 'monthly',
  };

  async function createIsolatedTransactionBatch(importRowCount: number) {
    const [batch] = await trx('bank_transaction_batches')
      .insert({
        bank_account_id: isolatedBankAccountId,
        company_id: isolatedCompanyId,
        start_date: '2025-03-15',
        end_date: '2025-03-16',
        source: 'manual_entry',
        fingerprint: randomUUID(),
        import_row_count: importRowCount,
        created_by_id: testUserId,
      })
      .returning<{ id: string }[]>('id');

    return batch.id;
  }

  beforeEach(async () => {
    const db = getTestDb();
    trx = await db.transaction();

    testCompanyId = await getTestCompanyId(trx, 'bizDemoUS');
    testUserId = await getTestUserId(trx, US_USER_EMAIL);
    testCurrencyId = await getCurrencyId(trx, 'USD');

    const cashCoa = await trx('coa')
      .where({ company_id: testCompanyId })
      .join('account_types', 'coa.account_type_id', 'account_types.id')
      .where('account_types.key', 'ca_bank')
      .select('coa.id')
      .first();
    if (!cashCoa) {
      throw new Error(
        'Demo company missing COA. Seed test demo data with: NODE_ENV=test pnpm -F @accountable-books/api run demo apply',
      );
    }
    testCoaId = cashCoa.id;

    let bankAccount = await trx('bank_accounts')
      .where({ company_id: testCompanyId, is_deleted: false })
      .first();
    if (!bankAccount) {
      let bank = await trx('banks').where({ key: 'us_chase_bank' }).first();
      if (!bank) {
        [bank] = await trx('banks')
          .insert({
            key: 'us_chase_bank',
            display_name: 'Chase Bank',
            country_code: 'US',
          })
          .returning('*');
      }
      [bankAccount] = await trx('bank_accounts')
        .insert({
          company_id: testCompanyId,
          display_name: 'Test Bank Account',
          account_type: 'checkings_current',
          business_or_personal: 'business',
          bank_id: bank.id,
          currency_id: testCurrencyId,
          coa_id: testCoaId,
          created_by_id: testUserId,
          updated_by_id: testUserId,
        })
        .returning('*');
    }
    testBankAccountId = bankAccount.id;

    // Isolated company + COA + bank account for tests that need no pre-existing bank txns or fiscal rows
    const country = await trx('countries').where('code', 'US').first();
    if (!country) throw new Error('US country not found');
    const shortCode = `cc-${randomUUID().slice(0, 8)}`;
    const [company] = await trx('companies')
      .insert({
        short_code: shortCode,
        legal_name: 'Condition check test company',
        display_name: 'Condition check test',
        type: 'business',
        country_id: country.id,
        reporting_currency_id: testCurrencyId,
        year_end_day: 31,
        year_end_month: 12,
        accounting_basis: 'modified_accrual_basis',
        created_by_id: testUserId,
      })
      .returning('*');
    if (!company) throw new Error('Failed to create isolated company');
    isolatedCompanyId = company.id;

    const accountTypeBank = await trx('account_types')
      .where('key', 'ca_bank')
      .first();
    if (!accountTypeBank) throw new Error('account_types.ca_bank not found');
    const [isolatedCoa] = await trx('coa')
      .insert({
        company_id: company.id,
        account_type_id: accountTypeBank.id,
        currency_id: testCurrencyId,
        name: 'Cash',
        code: '1000',
        created_by_id: testUserId,
      })
      .returning('*');
    if (!isolatedCoa) throw new Error('Failed to create isolated COA');

    let bank = await trx('banks').where({ key: 'us_chase_bank' }).first();
    if (!bank) {
      [bank] = await trx('banks')
        .insert({
          key: 'us_chase_bank',
          display_name: 'Chase Bank',
          country_code: 'US',
        })
        .returning('*');
    }
    const [isolatedBankAccount] = await trx('bank_accounts')
      .insert({
        company_id: company.id,
        display_name: 'Isolated test account',
        account_type: 'checkings_current',
        business_or_personal: 'business',
        bank_id: bank.id,
        currency_id: testCurrencyId,
        coa_id: isolatedCoa.id,
        created_by_id: testUserId,
        updated_by_id: testUserId,
      })
      .returning('*');
    if (!isolatedBankAccount)
      throw new Error('Failed to create isolated bank account');
    isolatedBankAccountId = isolatedBankAccount.id;
    isolatedCoaId = isolatedCoa.id;
  });

  afterEach(async () => {
    await trx.rollback();
  });

  describe('checkUncategorizedTransactions', () => {
    it('returns count 0 and isActive false when no bank transactions in period', async () => {
      const result = await checkUncategorizedTransactions(
        isolatedCompanyId,
        march2025,
        trx,
      );
      expect(result.code).toBe('uncategorized_transactions');
      expect(result.severity).toBe('warning');
      expect(result.isActive).toBe(false);
      expect(result.details).toEqual({ count: 0 });
    });

    it('returns count > 0 and isActive true when bank transactions have no ledger entry', async () => {
      const extId1 = `cc-${Date.now()}-1`;
      const extId2 = `cc-${Date.now()}-2`;
      const batchId = await createIsolatedTransactionBatch(2);
      await trx('bank_transactions').insert([
        {
          bank_account_id: isolatedBankAccountId,
          company_id: isolatedCompanyId,
          bank_transaction_batch_id: batchId,
          transaction_date: '2025-03-15',
          transaction_at: new Date('2025-03-15T12:00:00Z'),
          amount: -100,
          system_exchange_rate: 1,
          created_by_id: testUserId,
          idempotency_key: extId1,
        },
        {
          bank_account_id: isolatedBankAccountId,
          company_id: isolatedCompanyId,
          bank_transaction_batch_id: batchId,
          transaction_date: '2025-03-16',
          transaction_at: new Date('2025-03-16T12:00:00Z'),
          amount: -200,
          system_exchange_rate: 1,
          created_by_id: testUserId,
          idempotency_key: extId2,
        },
      ]);

      const result = await checkUncategorizedTransactions(
        isolatedCompanyId,
        march2025,
        trx,
      );
      expect(result.isActive).toBe(true);
      expect(result.details).toMatchObject({ count: 2 });
      expect(result.message).toContain('2 uncategorized transactions found');
    });

    it('excludes bank transactions that have a matching ledger_transaction', async () => {
      const extId = `cc-${Date.now()}-ledger`;
      const batchId = await createIsolatedTransactionBatch(1);
      const [bt] = await trx('bank_transactions')
        .insert({
          bank_account_id: isolatedBankAccountId,
          company_id: isolatedCompanyId,
          bank_transaction_batch_id: batchId,
          transaction_date: '2025-03-15',
          transaction_at: new Date('2025-03-15T12:00:00Z'),
          amount: -100,
          system_exchange_rate: 1,
          created_by_id: testUserId,
          idempotency_key: extId,
        })
        .returning('*');

      await trx('ledger_transactions').insert({
        company_id: isolatedCompanyId,
        transaction_date: '2025-03-15',
        transaction_source: 'bank_transaction',
        categorization_source: 'manual',
        source_transaction_id: bt.id,
        source_transaction_date: '2025-03-15',
        source_transaction_amount: -100,
        source_transaction_currency_id: testCurrencyId,
        created_by_id: testUserId,
      });

      const result = await checkUncategorizedTransactions(
        isolatedCompanyId,
        march2025,
        trx,
      );
      expect(result.isActive).toBe(false);
      expect(result.details).toEqual({ count: 0 });
    });
  });

  describe('checkDraftJournals', () => {
    it('returns count 0 and isActive false when no draft journals in period', async () => {
      const result = await checkDraftJournals(testCompanyId, march2025, trx);
      expect(result.code).toBe('draft_journals');
      expect(result.severity).toBe('hard');
      expect(result.isActive).toBe(false);
      expect(result.details).toEqual({ count: 0 });
    });

    it('returns count > 0 and isActive true when draft journal batches exist in period', async () => {
      const [batch] = await trx('journal_batches')
        .insert({
          company_id: isolatedCompanyId,
          date: '2025-03-10',
          title: 'Test draft journal',
          currency_id: testCurrencyId,
          exchange_rate: 1,
          status: 'draft',
          journal_source: 'one_off',
          created_by_id: testUserId,
        })
        .returning('*');

      await trx('journal_entries').insert([
        {
          company_id: isolatedCompanyId,
          journal_batch_id: batch.id,
          line_number: 1,
          coa_id: isolatedCoaId,
          side: 'debit',
          amount: 100,
          entry_status: 'active',
        },
        {
          company_id: isolatedCompanyId,
          journal_batch_id: batch.id,
          line_number: 2,
          coa_id: isolatedCoaId,
          side: 'credit',
          amount: 100,
          entry_status: 'active',
        },
      ]);

      const result = await checkDraftJournals(
        isolatedCompanyId,
        march2025,
        trx,
      );
      expect(result.isActive).toBe(true);
      expect(result.details).toMatchObject({ count: 2 });
      expect(result.message).toContain('unposted journal entries found');
    });
  });

  describe('checkLaterPeriodsClosed', () => {
    it('returns count 0 and isActive false when no later periods are closed', async () => {
      await trx('fiscal_calendar').insert({
        company_id: isolatedCompanyId,
        fiscal_year: 2025,
        period_number: 3,
        period_type: 'monthly',
        start_date: '2025-03-01',
        end_date: '2025-03-31',
        status: 'open',
      });

      const result = await checkLaterPeriodsClosed(
        isolatedCompanyId,
        march2025,
        trx,
      );
      expect(result.code).toBe('later_periods_closed');
      expect(result.severity).toBe('warning');
      expect(result.isActive).toBe(false);
      expect(result.details).toEqual({ count: 0 });
    });

    it('returns count > 0 when a chronologically later period is closed', async () => {
      await trx('fiscal_calendar').insert([
        {
          company_id: isolatedCompanyId,
          fiscal_year: 2025,
          period_number: 3,
          period_type: 'monthly',
          start_date: '2025-03-01',
          end_date: '2025-03-31',
          status: 'open',
        },
        {
          company_id: isolatedCompanyId,
          fiscal_year: 2025,
          period_number: 4,
          period_type: 'monthly',
          start_date: '2025-04-01',
          end_date: '2025-04-30',
          status: 'closed',
          closed_at: trx.fn.now(),
          closed_by_id: testUserId,
        },
      ]);

      const result = await checkLaterPeriodsClosed(
        isolatedCompanyId,
        march2025,
        trx,
      );
      expect(result.isActive).toBe(true);
      expect(result.details).toMatchObject({ count: 1 });
      expect(result.message).toBe('Later periods are already closed');
    });

    it('counts only same company and period_type', async () => {
      await trx('fiscal_calendar').insert({
        company_id: isolatedCompanyId,
        fiscal_year: 2025,
        period_number: 3,
        period_type: 'monthly',
        start_date: '2025-03-01',
        end_date: '2025-03-31',
        status: 'open',
      });
      await trx('fiscal_calendar').insert({
        company_id: isolatedCompanyId,
        fiscal_year: 2026,
        period_number: 1,
        period_type: 'monthly',
        start_date: '2026-01-01',
        end_date: '2026-01-31',
        status: 'closed',
        closed_at: trx.fn.now(),
        closed_by_id: testUserId,
      });

      const result = await checkLaterPeriodsClosed(
        isolatedCompanyId,
        march2025,
        trx,
      );
      expect(result.isActive).toBe(true);
      expect(result.details).toMatchObject({ count: 1 });
    });
  });

  describe('checkBankConnectionHealth', () => {
    it('returns count 0 and isActive false when no revoked/error accounts', async () => {
      const result = await checkBankConnectionHealth(testCompanyId, trx);
      expect(result.code).toBe('disconnected_bank');
      expect(result.severity).toBe('hard');
      expect(result.isActive).toBe(false);
      expect(result.details).toMatchObject({ count: 0, bankAccountIds: [] });
    });

    it('preserves revoked accounts as an unhealthy connection condition', async () => {
      const { connectionId } = await createConnectionFixture(trx, {
        companyId: isolatedCompanyId,
        userId: testUserId,
      });
      const revokedAccount = await createBankAccountFixture(trx, {
        companyId: isolatedCompanyId,
        coaId: isolatedCoaId,
        currencyId: testCurrencyId,
        userId: testUserId,
      });
      await createFeedFixture(trx, {
        companyId: isolatedCompanyId,
        bankAccountId: revokedAccount,
        connectionId,
        userId: testUserId,
        revoked: true,
      });

      const result = await checkBankConnectionHealth(isolatedCompanyId, trx);
      expect(result.isActive).toBe(true);
      expect(result.details.bankAccountIds).toContain(revokedAccount);
    });

    it('returns count > 0 when an account has an active feed on a connection requiring action', async () => {
      const { connectionId } = await createConnectionFixture(trx, {
        companyId: isolatedCompanyId,
        userId: testUserId,
        authorizationStatus: 'requires_action',
      });
      const errorAccount = await createBankAccountFixture(trx, {
        companyId: isolatedCompanyId,
        coaId: isolatedCoaId,
        currencyId: testCurrencyId,
        userId: testUserId,
      });
      await createFeedFixture(trx, {
        companyId: isolatedCompanyId,
        bankAccountId: errorAccount,
        connectionId,
        userId: testUserId,
      });

      const result = await checkBankConnectionHealth(isolatedCompanyId, trx);
      expect(result.isActive).toBe(true);
      expect(result.details.bankAccountIds).toContain(errorAccount);
    });

    it('does not count an account with no feed history as unhealthy', async () => {
      const result = await checkBankConnectionHealth(testCompanyId, trx);
      expect(result.isActive).toBe(false);
      expect(result.details).toMatchObject({ count: 0 });
    });

    it('does not count an account with a healthy active feed as unhealthy', async () => {
      const { connectionId } = await createConnectionFixture(trx, {
        companyId: isolatedCompanyId,
        userId: testUserId,
      });
      const healthyAccount = await createBankAccountFixture(trx, {
        companyId: isolatedCompanyId,
        coaId: isolatedCoaId,
        currencyId: testCurrencyId,
        userId: testUserId,
      });
      await createFeedFixture(trx, {
        companyId: isolatedCompanyId,
        bankAccountId: healthyAccount,
        connectionId,
        userId: testUserId,
      });

      const result = await checkBankConnectionHealth(isolatedCompanyId, trx);
      expect(result.isActive).toBe(false);
      expect(result.details.bankAccountIds).not.toContain(healthyAccount);
    });
  });

  describe('checkOpenClientQueries', () => {
    it('returns stub with isActive false', async () => {
      const result = await checkOpenClientQueries(testCompanyId, trx);
      expect(result.code).toBe('open_client_queries');
      expect(result.severity).toBe('warning');
      expect(result.isActive).toBe(false);
      expect(result.details).toEqual({});
      expect(result.message).toContain('No client queries system yet');
    });
  });

  describe('validatePeriodClose mapping (smoke)', () => {
    it('maps condition-check results to errors and warnings like validatePeriodClose', async () => {
      const [uncategorized, draftJournals, laterPeriods] = await Promise.all([
        checkUncategorizedTransactions(isolatedCompanyId, march2025, trx),
        checkDraftJournals(isolatedCompanyId, march2025, trx),
        checkLaterPeriodsClosed(isolatedCompanyId, march2025, trx),
      ]);
      const errors: string[] = [];
      const warnings: string[] = [];
      if (uncategorized.isActive) warnings.push(uncategorized.message);
      if (draftJournals.isActive) errors.push(draftJournals.message);
      if (laterPeriods.isActive) warnings.push(laterPeriods.message);
      expect(errors).toEqual([]);
      expect(warnings).toEqual([]);
      expect(errors.length === 0).toBe(true);
    });
  });
});

async function createConnectionFixture(
  trx: Knex.Transaction,
  input: {
    companyId: string;
    userId: string;
    authorizationStatus?: 'active' | 'requires_action' | 'revoked';
  },
): Promise<{ connectionId: string; providerId: string }> {
  let provider = await trx('bank_feed_providers')
    .where({ key: 'plaid' })
    .first();
  if (!provider) {
    [provider] = await trx('bank_feed_providers')
      .insert({
        key: 'plaid',
        display_name: 'Plaid',
        created_by_id: input.userId,
      })
      .returning('*');
  }

  const [connection] = await trx('bank_connections')
    .insert({
      company_id: input.companyId,
      provider_id: provider!.id,
      authorization_status: input.authorizationStatus ?? 'active',
      requires_action_at:
        input.authorizationStatus === 'requires_action' ? trx.fn.now() : null,
      connected_by_id: input.userId,
    })
    .returning<{ id: string }[]>('id');

  return { connectionId: connection.id, providerId: provider!.id };
}

async function createBankAccountFixture(
  trx: Knex.Transaction,
  input: {
    companyId: string;
    coaId: string;
    currencyId: string;
    userId: string;
  },
): Promise<string> {
  const bank = await trx('banks').where({ key: 'us_chase_bank' }).first();
  if (!bank) throw new Error('Expected us_chase_bank fixture');

  const [account] = await trx('bank_accounts')
    .insert({
      company_id: input.companyId,
      display_name: `Condition check account ${randomUUID()}`,
      account_type: 'checkings_current',
      business_or_personal: 'business',
      bank_id: bank.id,
      currency_id: input.currencyId,
      coa_id: input.coaId,
      created_by_id: input.userId,
      updated_by_id: input.userId,
    })
    .returning<{ id: string }[]>('id');

  return account.id;
}

async function createFeedFixture(
  trx: Knex.Transaction,
  input: {
    companyId: string;
    bankAccountId: string;
    connectionId: string;
    userId: string;
    revoked?: boolean;
  },
): Promise<string> {
  const [feed] = await trx('bank_account_feeds')
    .insert({
      company_id: input.companyId,
      bank_account_id: input.bankAccountId,
      bank_connection_id: input.connectionId,
      provider_account_id: `provider-account-${randomUUID()}`,
      connected_by_id: input.userId,
      revoked_at: input.revoked ? trx.fn.now() : null,
      revocation_origin: input.revoked ? 'client' : null,
      revoked_by_id: input.revoked ? input.userId : null,
    })
    .returning<{ id: string }[]>('id');

  return feed.id;
}
