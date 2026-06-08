import { randomUUID } from 'node:crypto';

import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const advisoryLocks = vi.hoisted(() => ({
  acquire: vi.fn(async () => undefined),
  companyKey: vi.fn((companyId: string) => `company:${companyId}`),
}));

vi.mock(
  '../../../shared/services/advisoryLocks.service.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../shared/services/advisoryLocks.service.js')
    >()),
    acquireAdvisoryXactLocks: advisoryLocks.acquire,
    lockKeyCompany: advisoryLocks.companyKey,
  }),
);

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

describe('COA mutation locking', () => {
  let trx: Knex.Transaction;
  let companyId: string;
  let userId: string;
  let currencyId: string;

  beforeEach(async () => {
    advisoryLocks.acquire.mockReset();
    advisoryLocks.acquire.mockResolvedValue(undefined);
    advisoryLocks.companyKey.mockClear();

    trx = await getTestDb().transaction();
    companyId = await getTestCompanyId(trx, 'bizDemoUS');
    userId = await getTestUserId(trx, US_USER_EMAIL);
    currencyId = await getCurrencyId(trx, 'USD');
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it.each(['edit', 'archive', 'unarchive', 'delete'] as const)(
    '%s acquires the company advisory lock before mutation',
    async (operation) => {
      const account = await createAccount(`Lock ${operation}`);
      if (operation === 'unarchive') {
        await archiveCoa({
          trx,
          companyId,
          userId,
          accountIds: [account.id],
        });
        advisoryLocks.acquire.mockClear();
        advisoryLocks.companyKey.mockClear();
      }

      const result =
        operation === 'edit'
          ? await editCoa({
              trx,
              companyId,
              userId,
              updates: [{ id: account.id, description: 'Locked edit' }],
            })
          : operation === 'archive'
            ? await archiveCoa({
                trx,
                companyId,
                userId,
                accountIds: [account.id],
              })
            : operation === 'unarchive'
              ? await unarchiveCoa({
                  trx,
                  companyId,
                  userId,
                  accountIds: [account.id],
                })
              : await deleteCoa({
                  trx,
                  companyId,
                  userId,
                  accountIds: [account.id],
                });

      expect(result.success).toBe(true);
      expect(advisoryLocks.companyKey).toHaveBeenCalledWith(companyId);
      expect(advisoryLocks.acquire).toHaveBeenCalledWith(trx, [
        `company:${companyId}`,
      ]);
    },
  );

  it('locks requested COA rows in deterministic ID order', async () => {
    const first = await createAccount('Ordered lock first');
    const second = await createAccount('Ordered lock second');
    const requestedIds = [first.id, second.id].sort().reverse();
    const queries: Array<{ sql: string; bindings?: readonly unknown[] }> = [];
    const listener = (query: {
      sql: string;
      bindings?: readonly unknown[];
    }) => queries.push(query);
    trx.on('query', listener);

    try {
      const result = await archiveCoa({
        trx,
        companyId,
        userId,
        accountIds: requestedIds,
      });
      expect(result.success).toBe(true);
    } finally {
      trx.removeListener('query', listener);
    }

    const lockQuery = queries.find(
      ({ sql }) =>
        sql.includes('from "coa"') && sql.includes('for update of "coa"'),
    );
    expect(lockQuery?.sql).toContain('order by "coa"."id" asc');
    expect(lockQuery?.bindings?.slice(0, 2)).toEqual([...requestedIds].sort());
  });

  it('maps advisory-lock exhaustion to a retryable conflict', async () => {
    const account = await createAccount('Lock contention');
    advisoryLocks.acquire.mockRejectedValueOnce(
      new Error(`Failed to acquire advisory lock: company:${companyId}`),
    );

    const result = await deleteCoa({
      trx,
      companyId,
      userId,
      accountIds: [account.id],
    });

    expect(result).toMatchObject({
      success: false,
      message: 'Chart of accounts update temporarily blocked',
      code: ErrorCode.CONFLICT,
      error: {
        operation: 'delete',
        reason: 'concurrent_company_operation',
        retryable: true,
      },
    });
  });

  it('uses the same company advisory key for posting and COA mutation', async () => {
    const affected = await createAccount('Shared posting lock');
    const counterpart = await createAccount('Shared posting counterpart');
    advisoryLocks.acquire.mockClear();
    advisoryLocks.companyKey.mockClear();

    const ledgerResult = await createLedgerRecord({
      trx,
      companyId,
      userId,
      data: {
        date: new Date('2025-01-15'),
        transaction_source: 'manual_journal',
        categorization_source: 'manual',
        source_transaction_currency_id: currencyId,
        transactions: [
          {
            fs_date: '2025-01-15',
            coa_id: affected.id,
            source_currency_id: currencyId,
            source_amount: 100,
            description: null,
          },
          {
            fs_date: '2025-01-15',
            coa_id: counterpart.id,
            source_currency_id: currencyId,
            source_amount: -100,
            description: null,
          },
        ],
      },
    });
    expect(ledgerResult.success).toBe(true);

    const editResult = await editCoa({
      trx,
      companyId,
      userId,
      updates: [{ id: affected.id, description: 'Edited after posting' }],
    });
    expect(editResult.success).toBe(true);

    expect(advisoryLocks.acquire).toHaveBeenCalledTimes(2);
    expect(advisoryLocks.acquire).toHaveBeenNthCalledWith(1, trx, [
      `company:${companyId}`,
    ]);
    expect(advisoryLocks.acquire).toHaveBeenNthCalledWith(2, trx, [
      `company:${companyId}`,
    ]);
  });

  async function createAccount(prefix: string): Promise<{ id: string }> {
    return createCoaAccount({
      trx,
      companyId,
      userId,
      input: {
        name: `${prefix} ${randomUUID()}`,
        account_type_key: 'ca_other',
      },
    });
  }
});
