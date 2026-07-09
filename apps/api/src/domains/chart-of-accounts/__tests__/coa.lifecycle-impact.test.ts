import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import { SYSTEM_USER_ID } from '../../../bootstrap/phases/users.bootstrap.js';
import { archiveCoa, createCoaAccount, deleteCoa } from '../coa.model.js';

describe('COA lifecycle impacts', () => {
  let trx: Knex.Transaction;
  let companyId: string;
  let userId: string;
  let currencyId: string;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    await trx.raw('SET LOCAL search_path TO app, public');
    userId = SYSTEM_USER_ID;
    currencyId = await getCurrencyId(trx, 'USD');
    companyId = await createCompany();
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('warns on archive and blocks delete for active operational references', async () => {
    const account = await createAccount('Operational references');
    await createDraftJournal(account.id);
    await createRecurringTemplate(account.id, 'active');
    await createRule(account.id, true);

    const archived = await archiveCoa({
      trx,
      companyId,
      userId,
      accountIds: [account.id],
    });

    expect(archived).toMatchObject({
      success: true,
      data: {
        warnings: [
          {
            id: account.id,
            impact: {
              draftJournals: 1,
              recurringTemplates: 1,
              categorizationRules: 1,
            },
          },
        ],
      },
    });

    const deleted = await deleteCoa({
      trx,
      companyId,
      userId,
      accountIds: [account.id],
    });

    expect(deleted).toMatchObject({
      success: false,
      error: {
        operation: 'delete',
        errors: [
          {
            id: account.id,
            error: 'Account has active operational references',
            impact: {
              draftJournals: 1,
              recurringTemplates: 1,
              categorizationRules: 1,
            },
          },
        ],
      },
    });
  });

  it('does not block deletion for closed templates or disabled rules', async () => {
    const account = await createAccount('Inactive references');
    await createRecurringTemplate(account.id, 'closed');
    await createRule(account.id, false);

    const result = await deleteCoa({
      trx,
      companyId,
      userId,
      accountIds: [account.id],
    });

    expect(result.success).toBe(true);
  });

  it.each(['draft', 'paused'] as const)(
    'treats a %s recurring template as an operational reference',
    async (status) => {
      const account = await createAccount(`${status} recurring`);
      await createRecurringTemplate(account.id, status);

      const result = await deleteCoa({
        trx,
        companyId,
        userId,
        accountIds: [account.id],
      });

      expect(result).toMatchObject({
        success: false,
        error: {
          operation: 'delete',
          errors: [
            {
              id: account.id,
              impact: { recurringTemplates: 1 },
            },
          ],
        },
      });
    },
  );

  it('invalidates complete derived predictions and candidates on archive', async () => {
    const account = await createAccount('Derived references');
    const derived = await createDerivedReferences(account.id);

    const result = await archiveCoa({
      trx,
      companyId,
      userId,
      accountIds: [account.id],
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        invalidatedDerivedData: {
          predictions: 1,
          candidates: 1,
        },
      },
    });
    expect(await derivedState(derived)).toEqual({
      prediction: true,
      predictionLine: true,
      candidate: true,
      candidateLine: true,
    });
  });

  it('invalidates nothing when another account makes the batch fail', async () => {
    const account = await createAccount('Derived rejected');
    const locked = await createAccount('Locked rejected', { locked: true });
    const derived = await createDerivedReferences(account.id);

    const result = await archiveCoa({
      trx,
      companyId,
      userId,
      accountIds: [account.id, locked.id],
    });

    expect(result.success).toBe(false);
    expect(await derivedState(derived)).toEqual({
      prediction: false,
      predictionLine: false,
      candidate: false,
      candidateLine: false,
    });
  });

  async function createAccount(
    prefix: string,
    input: { locked?: boolean } = {},
  ): Promise<{ id: string }> {
    const account = await createCoaAccount({
      trx,
      companyId,
      userId,
      input: {
        name: `${prefix} ${randomUUID()}`,
        account_type_key: 'ca_other',
        ...input,
      },
    });

    // Lifecycle versioning closes the current COA version with the row's
    // database timestamp. Normalize test-created versions so same-transaction
    // archive/delete operations do not trip the effective range constraint.
    await trx('coa_versions')
      .where({ coa_id: account.id, effective_to: null })
      .update({ effective_from: new Date('2000-01-01T00:00:00.000Z') });

    return account;
  }

  async function createDraftJournal(coaId: string): Promise<void> {
    const [batch] = await trx('journal_batches')
      .insert({
        date: '2025-01-15',
        title: `Draft ${randomUUID()}`,
        currency_id: currencyId,
        status: 'draft',
        company_id: companyId,
        created_by_id: userId,
      })
      .returning<{ id: string }[]>('id');

    await trx('journal_entries').insert([
      {
        company_id: companyId,
        journal_batch_id: batch.id,
        line_number: 1,
        description: null,
        side: 'debit',
        amount: 100,
        coa_id: coaId,
        entry_status: 'active',
      },
      {
        company_id: companyId,
        journal_batch_id: batch.id,
        line_number: 2,
        description: null,
        side: 'credit',
        amount: 100,
        coa_id: coaId,
        entry_status: 'active',
      },
    ]);
  }

  async function createRecurringTemplate(
    coaId: string,
    status: 'draft' | 'active' | 'paused' | 'closed',
  ): Promise<void> {
    const [template] = await trx('recurring_journal_templates')
      .insert({
        description: `Recurring ${randomUUID()}`,
        status,
        company_id: companyId,
        auto_post: false,
        currency_id: currencyId,
        template_timezone: 'Europe/London',
        frequency: 'monthly',
        start_date: new Date('2025-01-01'),
        next_run_date: status === 'active' ? new Date('2025-02-01') : null,
        created_by_id: userId,
      })
      .returning<{ id: string }[]>('id');

    await trx('recurring_journal_template_entries').insert({
      company_id: companyId,
      template_id: template.id,
      line_number: 1,
      description: 'Recurring line',
      amount: 100,
      transaction_side: 'debit',
      coa_id: coaId,
    });
  }

  async function createRule(coaId: string, enabled: boolean): Promise<void> {
    const [rule] = await trx('rules')
      .insert({
        name: `Rule ${randomUUID()}`,
        scope: 'company',
        company_id: companyId,
        bank_scope: 'all',
        direction_filter: 'all',
        enabled,
        created_by_id: userId,
      })
      .returning<{ id: string }[]>('id');

    await trx('rule_actions').insert({
      rule_id: rule.id,
      definition: {
        actions: [
          {
            type: 'categorize',
            lines: [
              {
                split_type: 'remainder',
                description: 'Target account',
                coa_id: coaId,
              },
            ],
          },
        ],
      },
      fingerprint: randomUUID().replaceAll('-', '').padEnd(64, '0'),
    });
  }

  async function createDerivedReferences(coaId: string) {
    const bankTransaction = await createBankTransaction();

    const task =
      (await trx('categorization_tasks')
        .where({
          bank_transaction_id: bankTransaction.id,
          bank_transaction_date: bankTransaction.date,
        })
        .first<{ id: string }>('id')) ??
      (
        await trx('categorization_tasks')
          .insert({
            bank_transaction_id: bankTransaction.id,
            bank_transaction_date: bankTransaction.date,
            company_id: companyId,
            enriched_transaction: {},
            enrichment_version: 'phase-3-test',
            source: 'manual',
          })
          .returning<{ id: string }[]>('id')
      )[0];
    if (!task) throw new Error('Failed to create categorization task fixture');
    const runId = randomUUID();
    const [prediction] = await trx('categorization_predictions')
      .insert({
        categorization_task_id: task.id,
        run_id: runId,
        bank_transaction_id: bankTransaction.id,
        bank_transaction_date: bankTransaction.date,
        company_id: companyId,
        source: 'manual',
        confidence: 1,
        updated_by_id: userId,
      })
      .returning<{ id: string }[]>('id');
    const [predictionLine] = await trx('categorization_prediction_lines')
      .insert({
        prediction_id: prediction.id,
        coa_id: coaId,
        signed_native_amount: 100,
        is_bank_leg: false,
      })
      .returning<{ id: string }[]>('id');
    const [candidate] = await trx('categorization_candidates')
      .insert({
        categorization_task_id: task.id,
        run_id: runId,
        bank_transaction_id: bankTransaction.id,
        bank_transaction_date: bankTransaction.date,
        prediction_id: prediction.id,
        company_id: companyId,
        source: 'manual',
        confidence: 1,
        updated_by_id: userId,
      })
      .returning<{ id: string }[]>('id');
    const [candidateLine] = await trx('categorization_candidate_lines')
      .insert({
        candidate_id: candidate.id,
        fs_date: bankTransaction.date,
        source_currency_id: currencyId,
        signed_native_amount: 100,
        system_exchange_rate: 1,
        custom_exchange_rate: 1,
        transaction_side: 'debit',
        coa_id: coaId,
        is_bank_leg: false,
      })
      .returning<{ id: string }[]>('id');

    return {
      predictionId: prediction.id,
      predictionLineId: predictionLine.id,
      candidateId: candidate.id,
      candidateLineId: candidateLine.id,
    };
  }

  async function derivedState(
    ids: Awaited<ReturnType<typeof createDerivedReferences>>,
  ) {
    const [prediction, predictionLine, candidate, candidateLine] =
      await Promise.all([
        isDeleted('categorization_predictions', ids.predictionId),
        isDeleted('categorization_prediction_lines', ids.predictionLineId),
        isDeleted('categorization_candidates', ids.candidateId),
        isDeleted('categorization_candidate_lines', ids.candidateLineId),
      ]);

    return {
      prediction,
      predictionLine,
      candidate,
      candidateLine,
    };
  }

  async function isDeleted(table: string, id: string): Promise<boolean> {
    const row = await trx(table)
      .where({ id })
      .first<{ is_deleted: boolean }>('is_deleted');
    if (!row) throw new Error(`Expected ${table} row ${id}`);
    return row.is_deleted;
  }

  async function createCompany(): Promise<string> {
    const countryId = await getCountryId(trx, 'US');
    const token = randomUUID();
    const [company] = await trx('companies')
      .insert({
        accounting_basis: 'modified_accrual_basis',
        country_id: countryId,
        created_by_id: userId,
        display_name: `COA Lifecycle ${token}`,
        legal_name: `COA Lifecycle ${token} LLC`,
        reporting_currency_id: currencyId,
        short_code: `coa_lifecycle_${token.slice(0, 8)}`,
        type: 'business',
        year_end_day: 31,
        year_end_month: 12,
      })
      .returning<{ id: string }[]>('id');

    return company.id;
  }

  async function createBankTransaction(): Promise<{
    id: string;
    date: string;
  }> {
    const bankAccountCoa = await createAccount('Bank account fixture');
    const bank = await trx('banks')
      .where({ is_deleted: false })
      .select('id')
      .first<{ id: string }>();
    if (!bank) throw new Error('Expected canonical bank fixture');

    const [bankAccount] = await trx('bank_accounts')
      .insert({
        account_number: `acct_${randomUUID()}`,
        bank_id: bank.id,
        coa_id: bankAccountCoa.id,
        company_id: companyId,
        created_by_id: userId,
        currency_id: currencyId,
        display_name: `Bank Account ${randomUUID()}`,
      })
      .returning<{ id: string }[]>('id');

    const transactionDate = '2025-01-15';
    const [batch] = await trx('bank_transaction_batches')
      .insert({
        bank_account_id: bankAccount.id,
        company_id: companyId,
        created_by_id: userId,
        end_date: transactionDate,
        fingerprint: `batch_${randomUUID()}`,
        import_row_count: 1,
        source: 'manual_entry',
        start_date: transactionDate,
      })
      .returning<{ id: string }[]>('id');

    const [transaction] = await trx('bank_transactions')
      .insert({
        amount: -100,
        bank_account_id: bankAccount.id,
        bank_transaction_batch_id: batch.id,
        company_id: companyId,
        created_by_id: userId,
        idempotency_key: `txn_${randomUUID()}`,
        system_exchange_rate: 1,
        transaction_at: new Date(`${transactionDate}T12:00:00.000Z`),
        transaction_date: transactionDate,
      })
      .returning<{ id: string; transaction_date: string }[]>([
        'id',
        'transaction_date',
      ]);

    return {
      id: transaction.id,
      date: transaction.transaction_date,
    };
  }

  async function getCurrencyId(
    trx: Knex.Transaction,
    code: string,
  ): Promise<string> {
    const currency = await trx('currencies')
      .where({ code })
      .select('id')
      .first<{ id: string }>();
    if (!currency) throw new Error(`Expected currency ${code}`);
    return currency.id;
  }

  async function getCountryId(
    trx: Knex.Transaction,
    code: string,
  ): Promise<string> {
    const country = await trx('countries')
      .where({ code })
      .select('id')
      .first<{ id: string }>();
    if (!country) throw new Error(`Expected country ${code}`);
    return country.id;
  }
});
