import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import { createRecurringTemplate } from '../../journals/recurring-templates.model.js';
import { createLedgerRecord } from '../../ledgers/ledgers.model.js';
import { archiveCoa, deleteCoa, editCoa } from '../coa.model.js';

type TestAccounts = {
  affected: string;
  counterpart: string;
  other: string;
  locked: string;
};

describe('COA mutation concurrency', () => {
  const db = getTestDb();
  const openTransactions = new Set<Knex.Transaction>();

  let companyId: string;
  let userId: string;
  let currencyId: string;
  let accounts: TestAccounts;

  beforeEach(async () => {
    ({ companyId, userId, currencyId, accounts } = await createFixture(db));
  });

  afterEach(async () => {
    for (const trx of openTransactions) {
      if (!trx.isCompleted()) {
        await trx.rollback();
      }
    }
    openTransactions.clear();

    if (companyId) {
      await cleanupFixture(db, companyId);
    }
  });

  it('waits for posting to commit, then rejects deletion after revalidation', async () => {
    const postingTrx = await beginTransaction();
    const posting = await createLedgerRecord({
      trx: postingTrx,
      companyId,
      userId,
      data: ledgerInput(accounts.affected, accounts.counterpart, currencyId),
    });
    expect(posting.success).toBe(true);

    const deletionPromise = deleteCoa({
      companyId,
      userId,
      accountIds: [accounts.affected],
    });
    await expectStillPending(deletionPromise);

    await commitTransaction(postingTrx);

    const deletion = await deletionPromise;
    expect(deletion).toMatchObject({
      success: false,
      error: {
        operation: 'delete',
        errors: [
          {
            id: accounts.affected,
            error: 'Accounts with transactions cannot be deleted',
          },
        ],
      },
    });
    expect(await coaState(accounts.affected)).toMatchObject({
      is_active: true,
      is_deleted: false,
    });
  });

  it.each(['archive', 'delete'] as const)(
    'waits for %s to commit, then rejects posting after revalidation',
    async (operation) => {
      const lifecycleTrx = await beginTransaction();
      const lifecycle =
        operation === 'archive'
          ? await archiveCoa({
              trx: lifecycleTrx,
              companyId,
              userId,
              accountIds: [accounts.affected],
            })
          : await deleteCoa({
              trx: lifecycleTrx,
              companyId,
              userId,
              accountIds: [accounts.affected],
            });
      expect(lifecycle.success).toBe(true);

      const postingPromise = createLedgerRecord({
        companyId,
        userId,
        data: ledgerInput(accounts.affected, accounts.counterpart, currencyId),
      });
      await expectStillPending(postingPromise);

      await commitTransaction(lifecycleTrx);

      const posting = await postingPromise;
      expect(posting).toMatchObject({
        success: false,
        message: 'Failed to create ledger transaction',
      });
      expect(String(posting.error)).toContain(
        `Account ${accounts.affected} - ${
          operation === 'archive' ? 'inactive' : 'deleted'
        }`,
      );
      expect(
        await db('ledger_entries')
          .where({ coa_id: accounts.affected })
          .first('id'),
      ).toBeUndefined();
    },
  );

  it('serializes concurrent mutations and preserves batch atomicity', async () => {
    const firstMutationTrx = await beginTransaction();
    const firstMutation = await editCoa({
      trx: firstMutationTrx,
      companyId,
      userId,
      updates: [
        {
          id: accounts.affected,
          description: 'Committed by the first mutation',
        },
      ],
    });
    expect(firstMutation.success).toBe(true);

    const secondMutationPromise = archiveCoa({
      companyId,
      userId,
      accountIds: [accounts.other, accounts.locked],
    });
    await expectStillPending(secondMutationPromise);

    await commitTransaction(firstMutationTrx);

    const secondMutation = await secondMutationPromise;
    expect(secondMutation).toMatchObject({
      success: false,
      error: {
        operation: 'archive',
        errors: [
          {
            id: accounts.locked,
            error: 'Locked accounts cannot be archived or deleted',
          },
        ],
      },
    });

    expect(await coaState(accounts.affected)).toMatchObject({
      description: 'Committed by the first mutation',
      is_active: true,
    });
    expect(await coaState(accounts.other)).toMatchObject({
      is_active: true,
      is_deleted: false,
      version_seq: 0,
    });
    expect(await coaState(accounts.locked)).toMatchObject({
      is_active: true,
      is_deleted: false,
      version_seq: 0,
    });
  });

  it('prevents a recurring-template reference from being created after archive', async () => {
    const lifecycleTrx = await beginTransaction();
    const archived = await archiveCoa({
      trx: lifecycleTrx,
      companyId,
      userId,
      accountIds: [accounts.affected],
    });
    expect(archived.success).toBe(true);

    const templatePromise = createRecurringTemplate({
      companyId,
      userId,
      input: {
        description: 'Concurrent recurring template',
        frequency: 'monthly',
        start_date_ymd: '2026-01-01',
        auto_post: false,
        entries: [
          {
            description: 'Affected account',
            side: 'debit',
            amount: 100,
            coa_id: accounts.affected,
          },
          {
            description: 'Counterpart account',
            side: 'credit',
            amount: 100,
            coa_id: accounts.counterpart,
          },
        ],
      },
    });
    await expectStillPending(templatePromise);

    await commitTransaction(lifecycleTrx);

    const template = await templatePromise;
    expect(template.success).toBe(false);
    expect(String(template.error)).toContain('Invalid or inactive COA IDs');
    expect(
      await db('recurring_journal_template_entries')
        .where({ coa_id: accounts.affected })
        .first('id'),
    ).toBeUndefined();
  });

  async function beginTransaction(): Promise<Knex.Transaction> {
    const trx = await db.transaction();
    openTransactions.add(trx);
    return trx;
  }

  async function commitTransaction(trx: Knex.Transaction): Promise<void> {
    await trx.commit();
    openTransactions.delete(trx);
  }

  async function coaState(id: string) {
    return db('coa')
      .where({ id })
      .first('description', 'is_active', 'is_deleted', 'version_seq');
  }
});

async function createFixture(db: Knex): Promise<{
  companyId: string;
  userId: string;
  currencyId: string;
  accounts: TestAccounts;
}> {
  return db.transaction(async (trx) => {
    const sourceCompany = await trx('companies')
      .where({ short_code: 'bizDemoUS' })
      .first<Record<string, unknown>>();
    if (!sourceCompany) {
      throw new Error('Expected bizDemoUS company fixture');
    }

    const accountType = await trx('account_types')
      .where({ key: 'ca_other' })
      .first<{ id: string }>('id');
    if (!accountType) {
      throw new Error('Expected ca_other account type fixture');
    }

    const companyId = randomUUID();
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    const userId = String(sourceCompany.created_by_id);
    const currencyId = String(sourceCompany.reporting_currency_id);

    await trx('companies').insert({
      ...sourceCompany,
      id: companyId,
      legal_name: `COA concurrency ${suffix}`,
      display_name: `COA concurrency ${suffix}`,
      short_code: `coaRace_${suffix}`,
      workspace_class: 'demo',
      assigned_firm_id: null,
      created_at: new Date(),
      updated_at: new Date(),
      is_deleted: false,
      deleted_at: null,
    });

    const accountRows = [
      { key: 'affected', name: `Affected ${suffix}`, locked: false },
      { key: 'counterpart', name: `Counterpart ${suffix}`, locked: false },
      { key: 'other', name: `Other ${suffix}`, locked: false },
      { key: 'locked', name: `Locked ${suffix}`, locked: true },
    ] as const;

    const inserted = await trx('coa')
      .insert(
        accountRows.map((account) => ({
          name: account.name,
          locked: account.locked,
          source: 'user',
          account_type_id: accountType.id,
          currency_id: currencyId,
          company_id: companyId,
          created_by_id: userId,
          updated_by_id: userId,
        })),
      )
      .returning<Array<{ id: string; name: string }>>(['id', 'name']);
    const idsByName = new Map(
      inserted.map((account) => [account.name, account.id]),
    );

    return {
      companyId,
      userId,
      currencyId,
      accounts: Object.fromEntries(
        accountRows.map((account) => {
          const id = idsByName.get(account.name);
          if (!id)
            throw new Error(`Failed to create ${account.key} COA fixture`);
          return [account.key, id];
        }),
      ) as TestAccounts,
    };
  });
}

async function cleanupFixture(db: Knex, companyId: string): Promise<void> {
  await db.transaction(async (trx) => {
    // Ledger entries are immutable in production. Replica mode is used only to
    // remove this test's isolated committed fixture.
    await trx.raw('SET LOCAL session_replication_role = replica');

    const ledgerTransactionIds = trx('ledger_transactions')
      .where({ company_id: companyId })
      .select('id');

    await trx('ledger_audit_logs')
      .whereIn('ledger_transaction_id', ledgerTransactionIds)
      .delete();
    await trx('ledger_entries')
      .whereIn('ledger_transaction_id', ledgerTransactionIds)
      .delete();
    await trx('ledger_transactions').where({ company_id: companyId }).delete();
    const recurringTemplateIds = trx('recurring_journal_templates')
      .where({ company_id: companyId })
      .select('id');
    await trx('recurring_journal_template_entries')
      .whereIn('template_id', recurringTemplateIds)
      .delete();
    await trx('recurring_journal_templates')
      .where({ company_id: companyId })
      .delete();
    await trx('coa_versions').where({ company_id: companyId }).delete();
    await trx('coa_snapshot_versions')
      .where({ company_id: companyId })
      .delete();
    await trx('coa').where({ company_id: companyId }).delete();
    await trx('companies').where({ id: companyId }).delete();
  });
}

function ledgerInput(
  affectedCoaId: string,
  counterpartCoaId: string,
  currencyId: string,
) {
  return {
    transaction_date: '2025-01-15',
    transaction_source: 'manual_journal' as const,
    categorization_source: 'manual' as const,
    source_transaction_id: randomUUID(),
    source_transaction_currency_id: currencyId,
    transactions: [
      {
        fs_date: '2025-01-15',
        coa_id: affectedCoaId,
        source_currency_id: currencyId,
        source_amount: 100,
        description: null,
      },
      {
        fs_date: '2025-01-15',
        coa_id: counterpartCoaId,
        source_currency_id: currencyId,
        source_amount: -100,
        description: null,
      },
    ],
  };
}

async function expectStillPending(promise: Promise<unknown>): Promise<void> {
  const state = await Promise.race([
    promise.then(
      () => 'settled',
      () => 'settled',
    ),
    new Promise<'pending'>((resolve) => {
      setTimeout(() => resolve('pending'), 150);
    }),
  ]);

  expect(state).toBe('pending');
}
