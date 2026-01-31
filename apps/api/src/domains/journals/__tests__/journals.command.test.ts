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
  postJournalRecord,
  reverseJournalRecord,
} from '../journals.command.js';

describe('postJournalRecord - Integration Tests', () => {
  let trx: Knex.Transaction;
  let testCompanyId: string;
  let testUserId: string;
  let usdCurrencyId: string;
  let ngnCurrencyId: string;
  let testCoaIds: { cash: string; expense: string };
  let otherCompanyId: string;

  beforeEach(async () => {
    const db = getTestDb();
    trx = await db.transaction();

    testCompanyId = await getTestCompanyId(trx, 'bizDemoUS');
    otherCompanyId = await getTestCompanyId(trx, 'firmDemoUS');
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

  describe('Decimal validation', () => {
    it('rejects entries with more than 2 decimal places', async () => {
      await expect(
        postJournalRecord({
          data: {
            date: '2025-01-25',
            title: 'Invalid Decimals',
            status: 'posted',
            currencyId: usdCurrencyId,
            entries: [
              {
                description: 'Cash',
                coaId: testCoaIds.cash,
                amount: 10.123,
                side: 'debit',
              },
              {
                description: 'Expense',
                coaId: testCoaIds.expense,
                amount: 10.123,
                side: 'credit',
              },
            ],
          },
          companyId: testCompanyId,
          userId: testUserId,
          trx,
        }),
      ).rejects.toThrow(/Amount cannot have more than 2 decimal places/);
    });

    it('accepts entries with exactly 2 decimal places', async () => {
      const result = await postJournalRecord({
        data: {
          date: '2025-01-26',
          title: 'Two Decimals',
          status: 'posted',
          currencyId: usdCurrencyId,
          entries: [
            {
              description: 'Cash',
              coaId: testCoaIds.cash,
              amount: 10.12,
              side: 'debit',
            },
            {
              description: 'Expense',
              coaId: testCoaIds.expense,
              amount: 10.12,
              side: 'credit',
            },
          ],
        },
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });
      expect(result.success).toBe(true);
    });

    it('accepts entries with 1 decimal place', async () => {
      const result = await postJournalRecord({
        data: {
          date: '2025-01-27',
          title: 'One Decimal',
          status: 'posted',
          currencyId: usdCurrencyId,
          entries: [
            {
              description: 'Cash',
              coaId: testCoaIds.cash,
              amount: 10.5,
              side: 'debit',
            },
            {
              description: 'Expense',
              coaId: testCoaIds.expense,
              amount: 10.5,
              side: 'credit',
            },
          ],
        },
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });
      expect(result.success).toBe(true);
    });

    it('accepts integer entries', async () => {
      const result = await postJournalRecord({
        data: {
          date: '2025-01-28',
          title: 'Integer',
          status: 'posted',
          currencyId: usdCurrencyId,
          entries: [
            {
              description: 'Cash',
              coaId: testCoaIds.cash,
              amount: 10,
              side: 'debit',
            },
            {
              description: 'Expense',
              coaId: testCoaIds.expense,
              amount: 10,
              side: 'credit',
            },
          ],
        },
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('reverseJournalRecord - Integration Tests', () => {
    it('voids a draft journal and marks it deleted', async () => {
      const draft = await postJournalRecord({
        data: {
          date: '2025-02-01',
          title: 'Draft To Void',
          status: 'draft',
          currencyId: usdCurrencyId,
          entries: [
            {
              description: 'Cash',
              coaId: testCoaIds.cash,
              amount: 15,
              side: 'debit',
            },
            {
              description: 'Expense',
              coaId: testCoaIds.expense,
              amount: 15,
              side: 'credit',
            },
          ],
        },
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });

      expect(draft.success).toBe(true);

      const result = await reverseJournalRecord({
        journalBatchId: draft.data!.journalBatchId,
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });

      expect(result.success).toBe(true);

      const batch = await trx('journal_batches')
        .where('id', draft.data!.journalBatchId)
        .first('status', 'is_deleted', 'voided_at');

      expect(batch.status).toBe('voided');
      expect(batch.is_deleted).toBe(true);
      expect(batch.voided_at).not.toBeNull();

      const entries = await trx('journal_entries')
        .where('journal_batch_id', draft.data!.journalBatchId)
        .select('is_deleted');
      expect(entries.every((e) => e.is_deleted)).toBe(true);
    });

    it('reverses a posted journal and links original/reversal', async () => {
      const posted = await postJournalRecord({
        data: {
          date: '2025-02-02',
          title: 'Posted To Reverse',
          status: 'posted',
          currencyId: usdCurrencyId,
          entries: [
            {
              description: 'Cash',
              coaId: testCoaIds.cash,
              amount: 40,
              side: 'debit',
            },
            {
              description: 'Expense',
              coaId: testCoaIds.expense,
              amount: 40,
              side: 'credit',
            },
          ],
        },
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });

      expect(posted.success).toBe(true);

      const reversal = await reverseJournalRecord({
        journalBatchId: posted.data!.journalBatchId,
        companyId: testCompanyId,
        userId: testUserId,
        reversalReason: 'Test reversal',
        reversalDate: new Date('2025-02-03'),
        trx,
      });

      expect(reversal.success).toBe(true);
      expect(reversal.data?.reversalJournalId).toBeTruthy();

      const original = await trx('journal_batches')
        .where('id', posted.data!.journalBatchId)
        .first('reversal_journal_id', 'reversed_at');

      expect(original.reversal_journal_id).toBe(
        reversal.data!.reversalJournalId,
      );
      expect(original.reversed_at).not.toBeNull();

      const reversalBatch = await trx('journal_batches')
        .where('id', reversal.data!.reversalJournalId)
        .first('original_journal_id', 'date');

      expect(reversalBatch.original_journal_id).toBe(
        posted.data!.journalBatchId,
      );
      expect(new Date(reversalBatch.date).toISOString()).toBe(
        '2025-02-03T00:00:00.000Z',
      );
    });

    it('rejects reversal when company does not own the journal', async () => {
      const posted = await postJournalRecord({
        data: {
          date: '2025-02-04',
          title: 'Posted Wrong Company',
          status: 'posted',
          currencyId: usdCurrencyId,
          entries: [
            {
              description: 'Cash',
              coaId: testCoaIds.cash,
              amount: 25,
              side: 'debit',
            },
            {
              description: 'Expense',
              coaId: testCoaIds.expense,
              amount: 25,
              side: 'credit',
            },
          ],
        },
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });

      expect(posted.success).toBe(true);

      await expect(
        reverseJournalRecord({
          journalBatchId: posted.data!.journalBatchId,
          companyId: otherCompanyId,
          userId: testUserId,
          trx,
        }),
      ).rejects.toThrow('Journal batch not found for company');
    });
  });
});
