import { randomUUID } from 'crypto';
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
import { getJournalsByCursor } from '../journals.query.js';

describe('getJournalsByCursor', () => {
  let trx: Knex.Transaction;
  let testCompanyId: string;
  let testUserId: string;
  let usdCurrencyId: string;
  let testCoaIds: { cash: string; expense: string };

  beforeEach(async () => {
    const db = getTestDb();
    trx = await db.transaction();

    testCompanyId = await getTestCompanyId(trx, 'bizDemoUS');
    testUserId = await getTestUserId(trx, US_USER_EMAIL);
    usdCurrencyId = await getCurrencyId(trx, 'USD');

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

  async function createJournal(
    userReference: string,
    date: string,
    status: 'draft' | 'posted' = 'draft',
  ) {
    const result = await postJournalRecord({
      data: {
        date,
        title: `Cursor Test ${userReference}`,
        description: 'Cursor pagination test',
        status,
        userReference,
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
    return result.data!.journalBatchId;
  }

  async function createTemplate(description: string, startDate: string) {
    const [row] = await trx('recurring_journal_templates')
      .insert({
        description,
        title: description,
        status: 'draft',
        company_id: testCompanyId,
        auto_post: false,
        currency_id: usdCurrencyId,
        template_timezone: 'America/New_York',
        frequency: 'monthly',
        start_date: new Date(`${startDate}T00:00:00Z`),
        created_by_id: testUserId,
      })
      .returning<{ id: string }[]>('id');

    return row.id;
  }

  it('paginates deterministically by created_at', async () => {
    await createJournal(`REF-${randomUUID()}`, '2099-01-10');
    await createJournal(`REF-${randomUUID()}`, '2099-01-11');

    const first = await getJournalsByCursor({
      userId: testUserId,
      companyId: testCompanyId,
      trx,
      queryData: {
        limit: 1,
        kinds: ['journal'],
        sortBy: 'created_at',
        sortDir: 'asc',
        dateFrom: '2099-01-01',
        dateTo: '2099-12-31',
        includeDeleted: true,
      },
    });

    expect(first.success).toBe(true);
    expect(first.data?.rows.length).toBe(1);
    expect(first.data?.hasMore).toBe(true);

    const cursor = first.data?.nextCursor;
    expect(cursor).toBeTruthy();

    const payload = JSON.parse(
      Buffer.from(cursor!, 'base64url').toString('utf8'),
    );
    expect(payload.sortBy).toBe('created_at');
    expect(payload.value).toMatch(/T.*Z$/);

    const second = await getJournalsByCursor({
      userId: testUserId,
      companyId: testCompanyId,
      trx,
      queryData: {
        limit: 1,
        sortBy: 'created_at',
        sortDir: 'asc',
        dateFrom: '2099-01-01',
        dateTo: '2099-12-31',
        cursor: cursor!,
        includeDeleted: true,
      },
    });

    expect(second.success).toBe(true);
    expect(second.data?.rows.length).toBe(1);
    expect(second.data?.rows[0].id).not.toBe(first.data?.rows[0].id);
  });

  it('paginates across system reference nulls with isNull cursor', async () => {
    const token = randomUUID();
    await createJournal(`REF-${token}`, '2099-02-10', 'posted');
    await createTemplate(`Template ${token} A`, '2099-02-01');
    await createTemplate(`Template ${token} B`, '2099-02-02');

    const first = await getJournalsByCursor({
      userId: testUserId,
      companyId: testCompanyId,
      trx,
      queryData: {
        limit: 2,
        sortBy: 'system_reference',
        sortDir: 'asc',
        dateFrom: '2099-01-01',
        dateTo: '2099-12-31',
        searchQuery: token,
        includeDeleted: true,
      },
    });

    expect(first.success).toBe(true);
    expect(first.data?.rows.length).toBe(2);
    expect(first.data?.hasMore).toBe(true);
    expect(first.data?.rows[0].kind).toBe('journal');
    expect(first.data?.rows[1].kind).toBe('recurring_template');

    const cursor = first.data?.nextCursor;
    expect(cursor).toBeTruthy();

    const payload = JSON.parse(
      Buffer.from(cursor!, 'base64url').toString('utf8'),
    );
    expect(payload.sortBy).toBe('system_reference');
    expect(payload.isNull).toBe(true);
    expect(payload.value).toBe('');

    const second = await getJournalsByCursor({
      userId: testUserId,
      companyId: testCompanyId,
      trx,
      queryData: {
        limit: 2,
        sortBy: 'system_reference',
        sortDir: 'asc',
        dateFrom: '2099-01-01',
        dateTo: '2099-12-31',
        cursor: cursor!,
        searchQuery: token,
        includeDeleted: true,
      },
    });

    expect(second.success).toBe(true);
    expect(second.data?.rows.length).toBe(1);
    expect(
      second.data?.rows.every((row) => row.kind === 'recurring_template'),
    ).toBe(true);
  });
});
