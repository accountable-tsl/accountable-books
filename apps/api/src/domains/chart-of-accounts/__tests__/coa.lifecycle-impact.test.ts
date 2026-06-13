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
import { archiveCoa, createCoaAccount, deleteCoa } from '../coa.model.js';

describe('COA lifecycle impacts', () => {
  let trx: Knex.Transaction;
  let companyId: string;
  let userId: string;
  let currencyId: string;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    companyId = await getTestCompanyId(trx, 'bizDemoUS');
    userId = await getTestUserId(trx, US_USER_EMAIL);
    currencyId = await getCurrencyId(trx, 'USD');
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
          predictions: 2,
          candidates: 1,
        },
      },
    });
    expect(await derivedState(derived)).toEqual({
      legacyPrediction: true,
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
      legacyPrediction: false,
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
    return createCoaAccount({
      trx,
      companyId,
      userId,
      input: {
        name: `${prefix} ${randomUUID()}`,
        account_type_key: 'ca_other',
        ...input,
      },
    });
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
    const bankTransaction = await trx('bank_transactions')
      .where({ company_id: companyId, is_deleted: false })
      .select('id', 'transaction_date as date')
      .first<{ id: string; date: string }>();
    if (!bankTransaction) throw new Error('Expected bank transaction fixture');

    const [legacyPrediction] = await trx('predictions')
      .insert({
        bank_transaction_id: bankTransaction.id,
        bank_transaction_date: bankTransaction.date,
        company_id: companyId,
        coa_id: coaId,
        method: 'human',
        confidence: 1,
        created_by_id: userId,
        updated_by_id: userId,
      })
      .returning<{ id: string }[]>('id');

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
      legacyPredictionId: legacyPrediction.id,
      predictionId: prediction.id,
      predictionLineId: predictionLine.id,
      candidateId: candidate.id,
      candidateLineId: candidateLine.id,
    };
  }

  async function derivedState(ids: Awaited<ReturnType<typeof createDerivedReferences>>) {
    const [legacyPrediction, prediction, predictionLine, candidate, candidateLine] =
      await Promise.all([
        isDeleted('predictions', ids.legacyPredictionId),
        isDeleted('categorization_predictions', ids.predictionId),
        isDeleted('categorization_prediction_lines', ids.predictionLineId),
        isDeleted('categorization_candidates', ids.candidateId),
        isDeleted('categorization_candidate_lines', ids.candidateLineId),
      ]);

    return {
      legacyPrediction,
      prediction,
      predictionLine,
      candidate,
      candidateLine,
    };
  }

  async function isDeleted(table: string, id: string): Promise<boolean> {
    const row = await trx(table).where({ id }).first<{ is_deleted: boolean }>(
      'is_deleted',
    );
    if (!row) throw new Error(`Expected ${table} row ${id}`);
    return row.is_deleted;
  }
});
