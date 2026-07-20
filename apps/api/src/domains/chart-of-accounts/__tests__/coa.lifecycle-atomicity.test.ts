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
import { ErrorCode } from '../../../shared/utils/response.utils.js';
import { createLedgerRecord } from '../../ledgers/ledgers.model.js';
import {
  archiveCoa,
  createCoaAccount,
  deleteCoa,
  editCoa,
  unarchiveCoa,
} from '../coa.model.js';

type CoaState = {
  name: string;
  code: string | null;
  is_active: boolean;
  is_deleted: boolean;
  deleted_at: Date | null;
  version_seq: number;
};

describe('COA lifecycle atomicity', () => {
  let trx: Knex.Transaction;
  let companyId: string;
  let userId: string;
  let currencyId: string;
  let counterpartCoaId: string;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    companyId = await getTestCompanyId(trx, 'bizDemoUS');
    userId = await getTestUserId(trx, US_USER_EMAIL);
    currencyId = await getCurrencyId(trx, 'USD');

    const counterpart = await trx('coa')
      .where({
        company_id: companyId,
        is_active: true,
        is_deleted: false,
      })
      .first<{ id: string }>('id');
    if (!counterpart) {
      throw new Error('Expected demo company to have an active COA');
    }
    counterpartCoaId = counterpart.id;
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('rejects duplicate account IDs without mutations', async () => {
    const account = await createAccount('Duplicate ID');
    const before = await getLifecycleState(account.id);

    const result = await archiveCoa({
      trx,
      companyId,
      userId,
      accountIds: [account.id, account.id],
    });

    expectRejected(result, 'archive', [
      { id: account.id, error: 'Duplicate account ID in request' },
    ]);
    expect(await getLifecycleState(account.id)).toEqual(before);
  });

  it('rejects an entire bulk archive when one account is locked', async () => {
    const valid = await createAccount('Valid archive');
    const locked = await createAccount('Locked archive', { locked: true });
    const before = await captureMutationState([valid.id, locked.id]);

    const result = await archiveCoa({
      trx,
      companyId,
      userId,
      accountIds: [valid.id, locked.id],
    });

    expectRejected(result, 'archive', [
      {
        id: locked.id,
        error: 'Locked accounts cannot be archived or deleted',
      },
    ]);
    expect(await captureMutationState([valid.id, locked.id])).toEqual(before);
  });

  it('rejects an entire bulk delete when one account is locked', async () => {
    const valid = await createAccount('Valid locked delete');
    const locked = await createAccount('Locked delete', { locked: true });
    const before = await captureMutationState([valid.id, locked.id]);

    const result = await deleteCoa({
      trx,
      companyId,
      userId,
      accountIds: [valid.id, locked.id],
    });

    expectRejected(result, 'delete', [
      {
        id: locked.id,
        error: 'Locked accounts cannot be archived or deleted',
      },
    ]);
    expect(await captureMutationState([valid.id, locked.id])).toEqual(before);
  });

  it.each(['archive', 'delete'] as const)(
    'rejects an entire bulk %s when one account is linked to a bank account',
    async (operation) => {
      const valid = await createAccount(`Valid bank ${operation}`);
      const bank = await createAccount(`Bank ${operation}`, {
        account_type_key: 'ca_bank',
      });
      await linkBankAccount(bank.id);
      const before = await captureMutationState([valid.id, bank.id]);

      const result =
        operation === 'archive'
          ? await archiveCoa({
              trx,
              companyId,
              userId,
              accountIds: [valid.id, bank.id],
            })
          : await deleteCoa({
              trx,
              companyId,
              userId,
              accountIds: [valid.id, bank.id],
            });

      expectRejected(result, operation, [
        {
          id: bank.id,
          error: 'Bank-linked accounts cannot be archived or deleted',
          impact: expect.objectContaining({ bankAccounts: 1 }),
        },
      ]);
      expect(await captureMutationState([valid.id, bank.id])).toEqual(before);
    },
  );

  it.each(['archive', 'delete'] as const)(
    'allows an unlinked ca_bank account to be %sd',
    async (operation) => {
      const bankTyped = await createAccount(`Unlinked bank ${operation}`, {
        account_type_key: 'ca_bank',
      });

      const result =
        operation === 'archive'
          ? await archiveCoa({
              trx,
              companyId,
              userId,
              accountIds: [bankTyped.id],
            })
          : await deleteCoa({
              trx,
              companyId,
              userId,
              accountIds: [bankTyped.id],
            });

      expect(result.success).toBe(true);
    },
  );

  it('rejects a no-op alongside an invalid account without mutations', async () => {
    const alreadyArchived = await createAccount('Already archived');
    const locked = await createAccount('Locked alongside no-op', {
      locked: true,
    });
    expect(
      (
        await archiveCoa({
          trx,
          companyId,
          userId,
          accountIds: [alreadyArchived.id],
        })
      ).success,
    ).toBe(true);
    const before = await captureMutationState([alreadyArchived.id, locked.id]);

    const result = await archiveCoa({
      trx,
      companyId,
      userId,
      accountIds: [alreadyArchived.id, locked.id],
    });

    expectRejected(result, 'archive', [
      {
        id: locked.id,
        error: 'Locked accounts cannot be archived or deleted',
      },
    ]);
    expect(await captureMutationState([alreadyArchived.id, locked.id])).toEqual(
      before,
    );
  });

  it('rejects an entire bulk delete when one account has ledger entries', async () => {
    const valid = await createAccount('Valid delete');
    const posted = await createAccount('Posted delete');
    const ledgerResult = await createLedgerRecord({
      trx,
      companyId,
      userId,
      data: {
        transaction_date: '2025-01-15',
        transaction_source: 'manual_journal',
        categorization_source: 'manual',
        source_transaction_id: randomUUID(),
        source_transaction_currency_id: currencyId,
        transactions: [
          {
            fs_date: '2025-01-15',
            coa_id: posted.id,
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
      },
    });
    expect(ledgerResult.success).toBe(true);
    const before = await captureMutationState([valid.id, posted.id]);

    const result = await deleteCoa({
      trx,
      companyId,
      userId,
      accountIds: [valid.id, posted.id],
    });

    expectRejected(result, 'delete', [
      {
        id: posted.id,
        error: 'Accounts with transactions cannot be deleted',
      },
    ]);
    expect(await captureMutationState([valid.id, posted.id])).toEqual(before);
  });

  it('rejects an entire bulk unarchive when one account is deleted', async () => {
    const archived = await createAccount('Archived unarchive');
    const deleted = await createAccount('Deleted unarchive');
    expect(
      (
        await archiveCoa({
          trx,
          companyId,
          userId,
          accountIds: [archived.id],
        })
      ).success,
    ).toBe(true);
    expect(
      (
        await deleteCoa({
          trx,
          companyId,
          userId,
          accountIds: [deleted.id],
        })
      ).success,
    ).toBe(true);
    const before = await captureMutationState([archived.id, deleted.id]);

    const result = await unarchiveCoa({
      trx,
      companyId,
      userId,
      accountIds: [archived.id, deleted.id],
    });

    expectRejected(result, 'unarchive', [
      { id: deleted.id, error: 'Deleted accounts cannot be unarchived' },
    ]);
    expect(await captureMutationState([archived.id, deleted.id])).toEqual(
      before,
    );
  });

  it('rejects valid edits alongside an unknown account type', async () => {
    const valid = await createAccount('Valid edit');
    const invalid = await createAccount('Invalid edit');
    const before = await captureMutationState([valid.id, invalid.id]);

    const result = await editCoa({
      trx,
      companyId,
      userId,
      updates: [
        { id: valid.id, name: `Changed ${randomUUID()}` },
        { id: invalid.id, accountTypeKey: `unknown-${randomUUID()}` },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe(ErrorCode.OPERATION_NOT_ALLOWED);
    expect(result.error).toMatchObject({
      operation: 'edit',
      errors: [
        {
          id: invalid.id,
          error: expect.stringContaining('Account type not found'),
        },
      ],
    });
    expect(await captureMutationState([valid.id, invalid.id])).toEqual(before);
  });

  it('updates and versions every account in an all-valid bulk request', async () => {
    const first = await createAccount('Bulk first');
    const second = await createAccount('Bulk second');
    const snapshotBefore = await getSnapshotVersion();

    const result = await archiveCoa({
      trx,
      companyId,
      userId,
      accountIds: [first.id, second.id],
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      updatedAccounts: [{ id: first.id }, { id: second.id }],
      errors: [],
    });
    expect(await getLifecycleState(first.id)).toMatchObject({
      is_active: false,
      version_seq: 2,
    });
    expect(await getLifecycleState(second.id)).toMatchObject({
      is_active: false,
      version_seq: 2,
    });
    expect(await getSnapshotVersion()).toBe(snapshotBefore + 1n);
  });

  it('succeeds without versions or snapshots when every account is a no-op', async () => {
    const first = await createAccount('No-op first');
    const second = await createAccount('No-op second');
    expect(
      (
        await archiveCoa({
          trx,
          companyId,
          userId,
          accountIds: [first.id, second.id],
        })
      ).success,
    ).toBe(true);
    const before = await captureMutationState([first.id, second.id]);

    const result = await archiveCoa({
      trx,
      companyId,
      userId,
      accountIds: [first.id, second.id],
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ updatedAccounts: [], errors: [] });
    expect(await captureMutationState([first.id, second.id])).toEqual(before);
  });

  it('keeps archived names and codes reserved case-insensitively', async () => {
    const name = `Archived name ${randomUUID()}`;
    const code = `ARCHIVED-${randomUUID()}`;
    const account = await createAccount(name, { code });
    const persisted = await getLifecycleState(account.id);
    expect(
      (
        await archiveCoa({
          trx,
          companyId,
          userId,
          accountIds: [account.id],
        })
      ).success,
    ).toBe(true);

    await expect(
      trx.transaction((savepoint) =>
        createCoaAccount({
          trx: savepoint,
          companyId,
          userId,
          input: {
            name: persisted.name.toUpperCase(),
            code: persisted.code!.toLowerCase(),
            account_type_key: 'ca_other',
          },
        }),
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('releases deleted names and codes for case-insensitive reuse', async () => {
    const name = `Deleted name ${randomUUID()}`;
    const code = `DELETED-${randomUUID()}`;
    const account = await createAccount(name, { code });
    const persisted = await getLifecycleState(account.id);
    expect(
      (
        await deleteCoa({
          trx,
          companyId,
          userId,
          accountIds: [account.id],
        })
      ).success,
    ).toBe(true);

    const replacement = await createCoaAccount({
      trx,
      companyId,
      userId,
      input: {
        name: persisted.name.toUpperCase(),
        code: persisted.code!.toLowerCase(),
        account_type_key: 'ca_other',
      },
    });

    expect(replacement.id).not.toBe(account.id);
    expect(await getLifecycleState(account.id)).toMatchObject({
      is_active: false,
      is_deleted: true,
      deleted_at: expect.any(Date),
    });
  });

  async function createAccount(
    prefix: string,
    input: {
      code?: string;
      locked?: boolean;
      account_type_key?: string;
    } = {},
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

  async function getLifecycleState(coaId: string): Promise<CoaState> {
    const row = await trx('coa')
      .where({ id: coaId })
      .first<CoaState>(
        'name',
        'code',
        'is_active',
        'is_deleted',
        'deleted_at',
        'version_seq',
      );
    if (!row) throw new Error(`Expected COA ${coaId}`);
    return row;
  }

  async function captureMutationState(coaIds: string[]) {
    const [accounts, versions, snapshotVersion] = await Promise.all([
      trx('coa')
        .whereIn('id', coaIds)
        .orderBy('id')
        .select('id', 'name', 'is_active', 'is_deleted', 'version_seq'),
      trx('coa_versions')
        .whereIn('coa_id', coaIds)
        .orderBy(['coa_id', 'version_seq'])
        .select('coa_id', 'version_seq', 'effective_to'),
      getSnapshotVersion(),
    ]);
    return { accounts, versions, snapshotVersion };
  }

  async function getSnapshotVersion(): Promise<bigint> {
    const snapshot = await trx('coa_snapshot_versions')
      .where({ company_id: companyId })
      .first<{
        snapshot_version: string | number | bigint;
      }>('snapshot_version');
    if (!snapshot) throw new Error('Expected COA snapshot');
    return BigInt(snapshot.snapshot_version);
  }

  async function linkBankAccount(coaId: string): Promise<void> {
    const bank = await trx('banks').first<{ id: string }>('id');
    if (!bank) throw new Error('Expected bank fixture');

    await trx('bank_accounts').insert({
      display_name: `Lifecycle bank ${randomUUID()}`,
      bank_id: bank.id,
      currency_id: currencyId,
      company_id: companyId,
      coa_id: coaId,
      created_by_id: userId,
      updated_by_id: userId,
    });
  }
});

function expectRejected(
  result: Awaited<ReturnType<typeof archiveCoa>>,
  operation: 'archive' | 'unarchive' | 'delete',
  errors: Array<{
    id: string;
    error: string;
    impact?: unknown;
  }>,
) {
  expect(result.success).toBe(false);
  expect(result.code).toBe(ErrorCode.OPERATION_NOT_ALLOWED);
  expect(result.error).toMatchObject({ operation, errors });
}
