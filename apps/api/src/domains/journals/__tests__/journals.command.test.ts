import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getCurrencyId,
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { postJournalRecord } from '../journals.command.js';

describe('postJournalRecord - Integration Tests', () => {
  let trx: Knex.Transaction;
  let testCompanyId: string;
  let testUserId: string;
  let usdCurrencyId: string;
  let ngnCurrencyId: string;
  let testCoaIds: { cash: string; expense: string };

  beforeEach(async () => {
    const db = getTestDb();
    trx = await db.transaction();

    testCompanyId = await getTestCompanyId(trx, 'bizDemoUS');
    testUserId = await getTestUserId(trx, US_USER_EMAIL);
    usdCurrencyId = await getCurrencyId(trx, 'USD');
    ngnCurrencyId = await getCurrencyId(trx, 'NGN');

    const cashCoa = await trx('coa')
      .where({ company_id: testCompanyId })
      .join('account_types', 'coa.account_type_id', 'account_types.id')
      .where('account_types.key', 'ca_bank')
      .select('coa.id')
      .first();

    const expenseCoa = await trx('coa')
      .where({ company_id: testCompanyId })
      .join('account_types', 'coa.account_type_id', 'account_types.id')
      .where('account_types.key', 'exp_opex_office_supplies')
      .select('coa.id')
      .first();

    if (!cashCoa || !expenseCoa) {
      throw new Error(
        'Demo company missing required COAs. Ensure demo data is seeded.',
      );
    }

    testCoaIds = { cash: cashCoa.id, expense: expenseCoa.id };
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('creates a posted journal and links ledger entries', async () => {
    const result = await postJournalRecord({
      data: {
        date: '2025-01-15',
        title: 'Test Journal',
        description: 'Posted journal with linkage',
        status: 'posted',
        currencyId: usdCurrencyId,
        entries: [
          {
            description: 'Cash',
            coaId: testCoaIds.cash,
            amount: 100,
            side: 'debit',
          },
          {
            description: 'Expense',
            coaId: testCoaIds.expense,
            amount: 100,
            side: 'credit',
          },
        ],
      },
      companyId: testCompanyId,
      userId: testUserId,
      trx,
    });

    expect(result.success).toBe(true);
    expect(result.data?.journalBatchId).toBeTruthy();
    expect(result.data?.ledgerTransactionId).toBeTruthy();

    const journalRows = await trx('journal_entries')
      .where('journal_batch_id', result.data!.journalBatchId)
      .select('ledger_entry_id', 'ledger_entry_fs_date');

    expect(journalRows.length).toBe(2);
    expect(journalRows.every((r) => r.ledger_entry_id)).toBe(true);
    expect(journalRows.every((r) => r.ledger_entry_fs_date)).toBe(true);
  });

  it('creates a draft journal without sequence fields', async () => {
    const result = await postJournalRecord({
      data: {
        date: '2025-01-16',
        title: 'Draft Journal',
        description: 'Draft journal',
        status: 'draft',
        reference: 'DRAFT-MANUAL-REF',
        currencyId: usdCurrencyId,
        entries: [
          {
            description: 'Cash',
            coaId: testCoaIds.cash,
            amount: 50,
            side: 'debit',
          },
          {
            description: 'Expense',
            coaId: testCoaIds.expense,
            amount: 50,
            side: 'credit',
          },
        ],
      },
      companyId: testCompanyId,
      userId: testUserId,
      trx,
    });

    expect(result.success).toBe(true);

    const batch = await trx('journal_batches')
      .where('id', result.data!.journalBatchId)
      .first('sequence_month', 'sequence_number', 'reference');

    expect(batch.sequence_month).toBeNull();
    expect(batch.sequence_number).toBeNull();
    expect(batch.reference).toBe('DRAFT-MANUAL-REF');
  });

  it('uses provided FX rate for posted FX journal', async () => {
    const result = await postJournalRecord({
      data: {
        date: '2025-01-20',
        title: 'FX Journal',
        description: 'FX journal with rate',
        status: 'posted',
        currencyId: ngnCurrencyId,
        exchangeRate: 0.001,
        entries: [
          {
            description: 'Cash',
            coaId: testCoaIds.cash,
            amount: 10000,
            side: 'debit',
          },
          {
            description: 'Expense',
            coaId: testCoaIds.expense,
            amount: 10000,
            side: 'credit',
          },
        ],
      },
      companyId: testCompanyId,
      userId: testUserId,
      trx,
    });

    expect(result.success).toBe(true);

    const batch = await trx('journal_batches')
      .where('id', result.data!.journalBatchId)
      .first('exchange_rate', 'currency_id');

    expect(Number(batch.exchange_rate)).toBeCloseTo(0.001, 10);
    expect(batch.currency_id).toBe(ngnCurrencyId);
  });

  it('fails when journal reference already exists', async () => {
    const first = await postJournalRecord({
      data: {
        date: '2025-01-22',
        title: 'First Journal',
        status: 'posted',
        reference: 'DUP-REF-001',
        currencyId: usdCurrencyId,
        entries: [
          {
            description: 'Cash',
            coaId: testCoaIds.cash,
            amount: 20,
            side: 'debit',
          },
          {
            description: 'Expense',
            coaId: testCoaIds.expense,
            amount: 20,
            side: 'credit',
          },
        ],
      },
      companyId: testCompanyId,
      userId: testUserId,
      trx,
    });

    expect(first.success).toBe(true);

    await expect(
      postJournalRecord({
        data: {
          date: '2025-01-23',
          title: 'Second Journal',
          status: 'posted',
          reference: 'DUP-REF-001',
          currencyId: usdCurrencyId,
          entries: [
            {
              description: 'Cash',
              coaId: testCoaIds.cash,
              amount: 30,
              side: 'debit',
            },
            {
              description: 'Expense',
              coaId: testCoaIds.expense,
              amount: 30,
              side: 'credit',
            },
          ],
        },
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      }),
    ).rejects.toThrow('Journal reference already exists');
  });
});
