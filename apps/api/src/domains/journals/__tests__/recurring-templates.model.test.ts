import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import {
  createRecurringTemplate,
  updateRecurringTemplateStatus,
} from '../recurring-templates.model.js';
import { ymdToUtcDate } from '../recurring-templates.schedule.js';

describe('recurring templates model', () => {
  let trx: Knex.Transaction;
  let testCompanyId: string;
  let testUserId: string;
  let coa: {
    cash: { id: string; name: string; code: string | null };
    expense: { id: string; name: string; code: string | null };
  };
  const createdTemplateIds: string[] = [];

  beforeEach(async () => {
    const db = getTestDb();
    trx = await db.transaction();

    testCompanyId = await getTestCompanyId(trx, 'bizDemoUS');
    testUserId = await getTestUserId(trx, US_USER_EMAIL);

    const cashCoa = await trx('coa')
      .where({ company_id: testCompanyId })
      .join('account_types', 'coa.account_type_id', 'account_types.id')
      .where('account_types.key', 'ca_bank')
      .select<
        { id: string; name: string; code: string | null }[]
      >('coa.id', 'coa.name', 'coa.code')
      .first();

    const expenseCoa = await trx('coa')
      .where({ company_id: testCompanyId })
      .join('account_types', 'coa.account_type_id', 'account_types.id')
      .where('account_types.key', 'exp_opex_office_supplies')
      .select<
        { id: string; name: string; code: string | null }[]
      >('coa.id', 'coa.name', 'coa.code')
      .first();

    if (!cashCoa || !expenseCoa) {
      throw new Error(
        'Demo company missing required COAs. Ensure demo data is seeded.',
      );
    }

    coa = { cash: cashCoa, expense: expenseCoa };
  });

  afterEach(async () => {
    for (const id of createdTemplateIds) {
      await trx('recurring_journal_template_entries')
        .where('template_id', id)
        .del();
      await trx('recurring_journal_templates').where('id', id).del();
    }
    await trx.rollback();
  });

  it('rejects invalid placeholder tokens on create', async () => {
    const result = await createRecurringTemplate({
      companyId: testCompanyId,
      userId: testUserId,
      input: {
        description: 'Rent accrual',
        title: 'Rent [Foo]',
        frequency: 'monthly',
        start_date_ymd: '2026-01-01',
        auto_post: false,
        entries: [
          {
            description: 'Rent expense',
            side: 'debit',
            amount: 1200,
            coa_id: coa.expense.id,
          },
          {
            description: 'Accrued liabilities',
            side: 'credit',
            amount: 1200,
            coa_id: coa.cash.id,
          },
        ],
      },
    });

    expect(result.success).toBe(false);
    expect(String(result.error)).toContain('Invalid placeholder tokens');
  });

  it('keeps next_run_date when resuming from paused', async () => {
    const createResult = await createRecurringTemplate({
      companyId: testCompanyId,
      userId: testUserId,
      input: {
        description: 'Monthly rent accrual',
        title: 'Rent [Month Year]',
        frequency: 'monthly',
        start_date_ymd: '2026-01-01',
        auto_post: false,
        entries: [
          {
            description: 'Rent expense',
            side: 'debit',
            amount: 1200,
            coa_id: coa.expense.id,
          },
          {
            description: 'Accrued liabilities',
            side: 'credit',
            amount: 1200,
            coa_id: coa.cash.id,
          },
        ],
      },
    });

    expect(createResult.success).toBe(true);
    const template = createResult.data!.template;
    createdTemplateIds.push(template.id);

    const pausedRunDateYMD = '2026-03-01';
    await trx('recurring_journal_templates')
      .where('id', template.id)
      .update({
        status: 'paused',
        next_run_date: ymdToUtcDate(
          pausedRunDateYMD,
          template.templateTimezone,
        ),
      });

    const resumeResult = await updateRecurringTemplateStatus({
      companyId: testCompanyId,
      templateId: template.id,
      input: { status: 'active' },
    });

    expect(resumeResult.success).toBe(true);
    expect(resumeResult.data!.template.nextRunDateYMD).toBe(pausedRunDateYMD);
  });

  it('rejects endDateYMD before startDateYMD', async () => {
    const result = await createRecurringTemplate({
      companyId: testCompanyId,
      userId: testUserId,
      input: {
        description: 'Bad dates',
        frequency: 'monthly',
        start_date_ymd: '2026-05-01',
        end_date_ymd: '2026-04-01',
        auto_post: false,
        entries: [
          {
            description: 'Rent expense',
            side: 'debit',
            amount: 1200,
            coa_id: coa.expense.id,
          },
          {
            description: 'Accrued liabilities',
            side: 'credit',
            amount: 1200,
            coa_id: coa.cash.id,
          },
        ],
      },
    });

    expect(result.success).toBe(false);
    expect(String(result.error)).toContain('endDateYMD');
  });
});
