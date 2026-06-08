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
  postDraftJournal,
  postJournalRecord,
} from '../../journals/journals.command.js';
import { createLedgerRecord } from '../../ledgers/ledgers.model.js';
import { archiveCoa, createCoaAccount, deleteCoa } from '../coa.model.js';

type CoaLifecycleState = 'archived' | 'deleted';

type PostingCounts = {
  journalBatches: number;
  journalEntries: number;
  ledgerTransactions: number;
  ledgerEntries: number;
};

describe('COA posting safety', () => {
  let trx: Knex.Transaction;
  let companyId: string;
  let userId: string;
  let currencyId: string;
  let activeCoaId: string;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    companyId = await getTestCompanyId(trx, 'bizDemoUS');
    userId = await getTestUserId(trx, US_USER_EMAIL);
    currencyId = await getCurrencyId(trx, 'USD');

    const activeCoa = await trx('coa')
      .where({
        company_id: companyId,
        is_active: true,
        is_deleted: false,
      })
      .first<{ id: string }>('id');

    if (!activeCoa) {
      throw new Error('Expected demo company to have an active COA');
    }
    activeCoaId = activeCoa.id;
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it.each<CoaLifecycleState>(['archived', 'deleted'])(
    'rejects a posted journal using a %s COA without partial writes',
    async (state) => {
      const invalidCoaId = await createLifecycleInvalidCoa(state);
      const before = await getPostingCounts(trx, companyId);

      await expect(
        postJournalRecord({
          data: journalInput({
            status: 'posted',
            validCoaId: activeCoaId,
            invalidCoaId,
            currencyId,
          }),
          companyId,
          userId,
          trx,
        }),
      ).rejects.toThrow('Invalid or inactive COA IDs');

      expect(await getPostingCounts(trx, companyId)).toEqual(before);
    },
  );

  it.each<CoaLifecycleState>(['archived', 'deleted'])(
    'revalidates a draft and rejects posting after its COA is %s',
    async (state) => {
      const affectedCoa = await createCoaAccount({
        trx,
        companyId,
        userId,
        input: {
          name: `Draft lifecycle ${randomUUID()}`,
          account_type_key: 'ca_other',
        },
      });
      const draft = await postJournalRecord({
        data: journalInput({
          status: 'draft',
          validCoaId: activeCoaId,
          invalidCoaId: affectedCoa.id,
          currencyId,
        }),
        companyId,
        userId,
        trx,
      });

      expect(draft.success).toBe(true);
      await applyLifecycleState(state, affectedCoa.id);
      const before = await getPostingCounts(trx, companyId);

      await expect(
        postDraftJournal({
          journalBatchId: draft.data!.journalBatchId,
          companyId,
          userId,
          trx,
        }),
      ).rejects.toThrow('Invalid or inactive COA IDs');

      expect(await getPostingCounts(trx, companyId)).toEqual(before);
      expect(
        await trx('journal_batches')
          .where({ id: draft.data!.journalBatchId })
          .first('status', 'ledger_transaction_id'),
      ).toMatchObject({
        status: 'draft',
        ledger_transaction_id: null,
      });
    },
  );

  it.each<CoaLifecycleState>(['archived', 'deleted'])(
    'rejects a direct ledger write using a %s COA without partial writes',
    async (state) => {
      const invalidCoaId = await createLifecycleInvalidCoa(state);
      const before = await getPostingCounts(trx, companyId);

      await expect(
        createLedgerRecord({
          data: {
            date: new Date('2025-01-15'),
            transaction_source: 'manual_journal',
            categorization_source: 'manual',
            source_transaction_currency_id: currencyId,
            transactions: [
              {
                fs_date: '2025-01-15',
                coa_id: activeCoaId,
                source_currency_id: currencyId,
                source_amount: -100,
                description: 'Valid account leg',
              },
              {
                fs_date: '2025-01-15',
                coa_id: invalidCoaId,
                source_currency_id: currencyId,
                source_amount: 100,
                description: 'Invalid account leg',
              },
            ],
          },
          companyId,
          userId,
          trx,
        }),
      ).rejects.toThrow(
        `Account ${invalidCoaId} - ${state === 'archived' ? 'inactive' : 'deleted'}`,
      );

      expect(await getPostingCounts(trx, companyId)).toEqual(before);
    },
  );

  async function createLifecycleInvalidCoa(
    state: CoaLifecycleState,
  ): Promise<string> {
    const account = await createCoaAccount({
      trx,
      companyId,
      userId,
      input: {
        name: `Posting safety ${state} ${randomUUID()}`,
        account_type_key: 'ca_other',
      },
    });
    await applyLifecycleState(state, account.id);
    return account.id;
  }

  async function applyLifecycleState(
    state: CoaLifecycleState,
    coaId: string,
  ): Promise<void> {
    const result =
      state === 'archived'
        ? await archiveCoa({
            accountIds: [coaId],
            companyId,
            userId,
            trx,
          })
        : await deleteCoa({
            accountIds: [coaId],
            companyId,
            userId,
            trx,
          });

    expect(result.success).toBe(true);
    expect(result.data?.updatedAccounts).toContainEqual({ id: coaId });
  }
});

function journalInput({
  status,
  validCoaId,
  invalidCoaId,
  currencyId,
}: {
  status: 'draft' | 'posted';
  validCoaId: string;
  invalidCoaId: string;
  currencyId: string;
}) {
  return {
    date: '2025-01-15',
    title: `COA posting safety ${randomUUID()}`,
    status,
    currencyId,
    entries: [
      {
        description: 'Valid account leg',
        coaId: validCoaId,
        amount: 100,
        side: 'debit' as const,
      },
      {
        description: 'Invalid account leg',
        coaId: invalidCoaId,
        amount: 100,
        side: 'credit' as const,
      },
    ],
  };
}

async function getPostingCounts(
  trx: Knex.Transaction,
  companyId: string,
): Promise<PostingCounts> {
  const [journalBatches, journalEntries, ledgerTransactions, ledgerEntries] =
    await Promise.all([
      countRows(trx('journal_batches').where({ company_id: companyId })),
      countRows(
        trx('journal_entries')
          .join(
            'journal_batches',
            'journal_entries.journal_batch_id',
            'journal_batches.id',
          )
          .where('journal_batches.company_id', companyId),
      ),
      countRows(trx('ledger_transactions').where({ company_id: companyId })),
      countRows(
        trx('ledger_entries')
          .join(
            'ledger_transactions',
            'ledger_entries.ledger_transaction_id',
            'ledger_transactions.id',
          )
          .where('ledger_transactions.company_id', companyId),
      ),
    ]);

  return {
    journalBatches,
    journalEntries,
    ledgerTransactions,
    ledgerEntries,
  };
}

async function countRows(query: Knex.QueryBuilder): Promise<number> {
  const result = await query.count<{ count: string }[]>('* as count');
  return Number(result[0]?.count ?? 0);
}
