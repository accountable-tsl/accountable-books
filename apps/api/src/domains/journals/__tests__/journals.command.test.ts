import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getCurrencyId,
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { toYMD } from '../../../shared/index.js';
import {
  copyJournal,
  postDraftJournal,
  postDraftJournalsBatch,
  postJournalRecord,
  reverseJournalRecord,
  updateDraftJournal,
  voidDraftJournal,
  voidDraftJournalsBatch,
} from '../journals.command.js';
import { getJournal, getJournalsByPage } from '../journals.query.js';

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
      .select('ledger_entry_id');

    expect(journalRows.length).toBe(2);
    expect(journalRows.every((r) => r.ledger_entry_id)).toBe(true);
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

  it('lists voided journals with correct totals when includeDeleted=true', async () => {
    const created = await postJournalRecord({
      data: {
        date: '2025-01-30',
        title: 'Draft to Void',
        status: 'draft',
        currencyId: usdCurrencyId,
        entries: [
          {
            description: 'Cash',
            coaId: testCoaIds.cash,
            amount: 123.45,
            side: 'debit',
          },
          {
            description: 'Expense',
            coaId: testCoaIds.expense,
            amount: 123.45,
            side: 'credit',
          },
        ],
      },
      companyId: testCompanyId,
      userId: testUserId,
      trx,
    });

    expect(created.success).toBe(true);
    const journalId = created.data!.journalBatchId;

    const voided = await voidDraftJournal({
      journalBatchId: journalId,
      companyId: testCompanyId,
      userId: testUserId,
      trx,
    });
    expect(voided.success).toBe(true);

    const listed = await getJournalsByPage({
      userId: testUserId,
      companyId: testCompanyId,
      queryData: {
        page: 1,
        pageSize: 25,
        includeDeleted: true,
        dateFrom: '2025-01-01',
        dateTo: '2025-12-31',
        sortBy: 'created_at',
        sortDir: 'desc',
      },
      trx,
    });

    expect(listed.success).toBe(true);
    const row = listed.data!.journals.find((j) => j.id === journalId);
    expect(row).toBeTruthy();
    expect(Number(row!.totalDebit)).toBeCloseTo(123.45, 2);
    expect(Number(row!.totalCredit)).toBeCloseTo(123.45, 2);
  });

  it('uses provided FX rate for posted FX journal', async () => {
    // Ensure a system FX rate exists in the same transaction to avoid external API fallback.
    await trx('exchange_rates').insert({
      rate_date: '2025-01-20',
      base_currency_id: ngnCurrencyId,
      price_currency_id: usdCurrencyId,
      rate: 0.001,
      source: 'manual',
    });

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

  describe('voidDraftJournal - Integration Tests', () => {
    it('voids a draft journal (draft-only)', async () => {
      const draft = await postJournalRecord({
        data: {
          date: '2025-04-01',
          title: 'Draft To Void (Dedicated)',
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

      const result = await voidDraftJournal({
        journalBatchId: draft.data!.journalBatchId,
        companyId: testCompanyId,
        userId: testUserId,
        voidReason: 'Test void',
        trx,
      });

      expect(result.success).toBe(true);

      const batch = await trx('journal_batches')
        .where('id', draft.data!.journalBatchId)
        .first('status', 'is_deleted', 'voided_at');

      expect(batch.status).toBe('voided');
      expect(batch.is_deleted).toBe(true);
      expect(batch.voided_at).not.toBeNull();
    });

    it('rejects voiding a posted journal', async () => {
      const posted = await postJournalRecord({
        data: {
          date: '2025-04-02',
          title: 'Posted To Void (Should Fail)',
          status: 'posted',
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

      expect(posted.success).toBe(true);

      await expect(
        voidDraftJournal({
          journalBatchId: posted.data!.journalBatchId,
          companyId: testCompanyId,
          userId: testUserId,
          trx,
        }),
      ).rejects.toThrow('Only draft journals can be voided');
    });
  });

  describe('postDraftJournal - Integration Tests', () => {
    it('posts an existing draft and links ledger entries', async () => {
      const draft = await postJournalRecord({
        data: {
          date: '2025-04-10',
          title: 'Draft To Post',
          status: 'draft',
          currencyId: usdCurrencyId,
          entries: [
            {
              description: 'Cash',
              coaId: testCoaIds.cash,
              amount: 55,
              side: 'debit',
            },
            {
              description: 'Expense',
              coaId: testCoaIds.expense,
              amount: 55,
              side: 'credit',
            },
          ],
        },
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });

      expect(draft.success).toBe(true);

      const result = await postDraftJournal({
        journalBatchId: draft.data!.journalBatchId,
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });

      expect(result.success).toBe(true);
      expect(result.data?.ledgerTransactionId).toBeTruthy();
      expect(result.data?.journalReference).toBeTruthy();

      const batch = await trx('journal_batches')
        .where('id', draft.data!.journalBatchId)
        .first('status', 'sequence_month', 'sequence_number', 'reference');

      expect(batch.status).toBe('posted');
      expect(batch.sequence_month).not.toBeNull();
      expect(batch.sequence_number).not.toBeNull();
      expect(batch.reference).toBeTruthy();

      const entries = await trx('journal_entries')
        .where('journal_batch_id', draft.data!.journalBatchId)
        .where('is_deleted', false)
        .select('ledger_entry_id');

      expect(entries.length).toBe(2);
      expect(entries.every((e) => e.ledger_entry_id)).toBe(true);
    });
  });

  describe('postDraftJournalsBatch - Integration Tests', () => {
    it('posts multiple drafts (all_or_nothing) and returns per-item results', async () => {
      const d1 = await postJournalRecord({
        data: {
          date: '2025-04-20',
          title: 'Draft Batch 1',
          status: 'draft',
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

      const d2 = await postJournalRecord({
        data: {
          date: '2025-04-21',
          title: 'Draft Batch 2',
          status: 'draft',
          currencyId: usdCurrencyId,
          entries: [
            {
              description: 'Cash',
              coaId: testCoaIds.cash,
              amount: 12,
              side: 'debit',
            },
            {
              description: 'Expense',
              coaId: testCoaIds.expense,
              amount: 12,
              side: 'credit',
            },
          ],
        },
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });

      expect(d1.success).toBe(true);
      expect(d2.success).toBe(true);

      const result = await postDraftJournalsBatch({
        companyId: testCompanyId,
        userId: testUserId,
        journalIds: [d1.data!.journalBatchId, d2.data!.journalBatchId],
        mode: 'all_or_nothing',
        trx,
      });

      expect(result.success).toBe(true);
      expect(result.data?.results.length).toBe(2);
      expect(result.data?.summary.posted).toBe(2);

      const statuses = await trx('journal_batches')
        .whereIn('id', [d1.data!.journalBatchId, d2.data!.journalBatchId])
        .select('status');
      expect(statuses.every((s) => s.status === 'posted')).toBe(true);
    });
  });

  describe('voidDraftJournalsBatch - Integration Tests', () => {
    it('voids multiple drafts (partial) and returns per-item results', async () => {
      const d1 = await postJournalRecord({
        data: {
          date: '2025-04-25',
          title: 'Draft Void Batch 1',
          status: 'draft',
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

      const d2 = await postJournalRecord({
        data: {
          date: '2025-04-26',
          title: 'Draft Void Batch 2',
          status: 'draft',
          currencyId: usdCurrencyId,
          entries: [
            {
              description: 'Cash',
              coaId: testCoaIds.cash,
              amount: 12,
              side: 'debit',
            },
            {
              description: 'Expense',
              coaId: testCoaIds.expense,
              amount: 12,
              side: 'credit',
            },
          ],
        },
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });

      expect(d1.success).toBe(true);
      expect(d2.success).toBe(true);

      const result = await voidDraftJournalsBatch({
        companyId: testCompanyId,
        userId: testUserId,
        journalIds: [d1.data!.journalBatchId, d2.data!.journalBatchId],
        voidReason: 'Bulk delete',
        mode: 'partial',
        trx,
      });

      expect(result.success).toBe(true);
      expect(result.data?.results.length).toBe(2);
      expect(result.data?.summary.voided).toBe(2);

      const statuses = await trx('journal_batches')
        .whereIn('id', [d1.data!.journalBatchId, d2.data!.journalBatchId])
        .select('status', 'is_deleted');
      expect(statuses.every((s) => s.status === 'voided')).toBe(true);
      expect(statuses.every((s) => s.is_deleted === true)).toBe(true);
    });
  });

  describe('copyJournal - Integration Tests', () => {
    it('copies a journal into a new draft dated today (without files by default)', async () => {
      const source = await postJournalRecord({
        data: {
          date: '2025-04-28',
          title: 'Copy Source',
          status: 'draft',
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

      expect(source.success).toBe(true);

      const result = await copyJournal({
        sourceJournalBatchId: source.data!.journalBatchId,
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });

      expect(result.success).toBe(true);
      expect(result.data?.journalBatchId).toBeTruthy();

      const copiedId = result.data!.journalBatchId;

      const copiedBatch = await trx('journal_batches')
        .where('id', copiedId)
        .first(
          'status',
          'date',
          'reference',
          'original_journal_id',
          'ledger_transaction_id',
        );

      expect(copiedBatch.status).toBe('draft');
      // Verify the date is today (±1 day to account for timezone differences)
      const copiedDate = new Date(copiedBatch.date);
      const now = new Date();
      const dayDiff = Math.abs(
        copiedDate.getUTCDate() -
          now.getUTCDate() +
          (copiedDate.getUTCMonth() - now.getUTCMonth()) * 30,
      );
      expect(dayDiff).toBeLessThanOrEqual(1);
      expect(copiedBatch.reference).toBeNull();
      expect(copiedBatch.original_journal_id).toBe(source.data!.journalBatchId);
      expect(copiedBatch.ledger_transaction_id).toBeNull();

      const copiedEntries = await trx('journal_entries')
        .where('journal_batch_id', copiedId)
        .where('is_deleted', false)
        .select('coa_id', 'amount', 'side', 'description');

      expect(copiedEntries.length).toBe(2);
      expect(copiedEntries.some((e) => e.side === 'debit')).toBe(true);
      expect(copiedEntries.some((e) => e.side === 'credit')).toBe(true);

      const copiedAttachments = await trx('file_attachments')
        .where('source', 'journal')
        .where('transaction_id', copiedId)
        .where('is_deleted', false);
      expect(copiedAttachments.length).toBe(0);
    });

    it('copies files when includeFiles=true', async () => {
      const source = await postJournalRecord({
        data: {
          date: '2025-04-29',
          title: 'Copy Source With File',
          status: 'draft',
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
          files: [
            {
              name: 'receipt.pdf',
              key: `${testCompanyId}/journals/receipt.pdf`,
              bucket_name: 'txnFiles',
              url: 'https://example.com/receipt.pdf',
              type: 'application/pdf',
              size_bytes: 1024,
              checksum: null,
            },
          ],
        },
        companyId: testCompanyId,
        userId: testUserId,
        trx,
      });

      expect(source.success).toBe(true);

      const sourceAttachments = await trx('file_attachments')
        .where('source', 'journal')
        .where('transaction_id', source.data!.journalBatchId)
        .where('is_deleted', false);
      expect(sourceAttachments.length).toBe(1);

      const result = await copyJournal({
        sourceJournalBatchId: source.data!.journalBatchId,
        companyId: testCompanyId,
        userId: testUserId,
        includeFiles: true,
        trx,
      });

      expect(result.success).toBe(true);
      const copiedId = result.data!.journalBatchId;

      const copiedAttachments = await trx('file_attachments')
        .where('source', 'journal')
        .where('transaction_id', copiedId)
        .where('is_deleted', false);
      expect(copiedAttachments.length).toBe(1);

      const detail = await getJournal({
        journalId: copiedId,
        companyId: testCompanyId,
        includeFiles: true,
        trx,
      });

      expect(detail.success).toBe(true);
      expect(detail.data?.files?.length).toBe(1);
      expect(detail.data?.files?.[0]?.key).toBe(
        `${testCompanyId}/journals/receipt.pdf`,
      );
    });
  });

  describe('updateDraftJournal - Integration Tests', () => {
    it('updates a draft journal in-place and replaces entries', async () => {
      const draft = await postJournalRecord({
        data: {
          date: '2025-03-01',
          title: 'Draft To Update',
          description: 'Original draft',
          status: 'draft',
          reference: 'DRAFT-TO-UPDATE-001',
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

      expect(draft.success).toBe(true);

      const result = await updateDraftJournal({
        journalBatchId: draft.data!.journalBatchId,
        companyId: testCompanyId,
        userId: testUserId,
        data: {
          date: '2025-03-02',
          title: 'Draft Updated',
          description: 'Updated draft',
          status: 'draft',
          reference: 'DRAFT-TO-UPDATE-002',
          currencyId: usdCurrencyId,
          entries: [
            {
              description: 'Cash updated',
              coaId: testCoaIds.cash,
              amount: 25,
              side: 'debit',
            },
            {
              description: 'Expense updated',
              coaId: testCoaIds.expense,
              amount: 25,
              side: 'credit',
            },
          ],
        },
        trx,
      });

      expect(result.success).toBe(true);
      expect(result.data?.journalBatchId).toBe(draft.data!.journalBatchId);
      expect(result.data?.journalReference).toBe('DRAFT-TO-UPDATE-002');

      const batch = await trx('journal_batches')
        .where('id', draft.data!.journalBatchId)
        .first(
          'title',
          'description',
          'date',
          'status',
          'reference',
          'sequence_month',
          'sequence_number',
          'ledger_transaction_id',
        );

      expect(batch.status).toBe('draft');
      expect(batch.title).toBe('Draft Updated');
      expect(batch.description).toBe('Updated draft');
      expect(batch.reference).toBe('DRAFT-TO-UPDATE-002');
      expect(batch.sequence_month).toBeNull();
      expect(batch.sequence_number).toBeNull();
      expect(batch.ledger_transaction_id).toBeNull();

      const activeEntries = await trx('journal_entries')
        .where('journal_batch_id', draft.data!.journalBatchId)
        .where('is_deleted', false)
        .select('description', 'amount');

      expect(activeEntries.length).toBe(2);
      expect(activeEntries.map((e) => e.description).sort()).toEqual(
        ['Cash updated', 'Expense updated'].sort(),
      );

      const deletedEntries = await trx('journal_entries')
        .where('journal_batch_id', draft.data!.journalBatchId)
        .where('is_deleted', true)
        .select('id');

      expect(deletedEntries.length).toBe(2);
    });

    it('rejects updating a posted journal', async () => {
      const posted = await postJournalRecord({
        data: {
          date: '2025-03-05',
          title: 'Posted To Update',
          status: 'posted',
          currencyId: usdCurrencyId,
          entries: [
            {
              description: 'Cash',
              coaId: testCoaIds.cash,
              amount: 12,
              side: 'debit',
            },
            {
              description: 'Expense',
              coaId: testCoaIds.expense,
              amount: 12,
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
        updateDraftJournal({
          journalBatchId: posted.data!.journalBatchId,
          companyId: testCompanyId,
          userId: testUserId,
          data: {
            date: '2025-03-06',
            title: 'Should Fail',
            status: 'draft',
            currencyId: usdCurrencyId,
            entries: [
              {
                description: 'Cash',
                coaId: testCoaIds.cash,
                amount: 12,
                side: 'debit',
              },
              {
                description: 'Expense',
                coaId: testCoaIds.expense,
                amount: 12,
                side: 'credit',
              },
            ],
          },
          trx,
        }),
      ).rejects.toThrow('Only draft journals can be updated');
    });
  });
});
