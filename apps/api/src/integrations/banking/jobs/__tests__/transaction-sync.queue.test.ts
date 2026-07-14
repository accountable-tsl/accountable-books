import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queueBroker } from '../../../../jobs/queues/queue-broker.js';
import {
  BANK_ACCOUNT_SYNC_JOB_ATTEMPTS,
  BANK_ACCOUNT_SYNC_JOB_BACKOFF,
  BANK_ACCOUNT_SYNC_LOCK_TTL_SECONDS,
} from '../../transaction-sync.constants.js';
import {
  scheduleSyncForCredential,
  scheduleTransactionSync,
  transactionSyncQueue,
} from '../transaction-sync.queue.js';

const bankAccounts = vi.hoisted(() => ({
  getSyncable: vi.fn(),
}));

vi.mock(
  '../../../../domains/banking/bankAccounts/bankAccounts.model.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../domains/banking/bankAccounts/bankAccounts.model.js')
    >()),
    getSyncableBankAccounts: bankAccounts.getSyncable,
  }),
);

describe('transaction sync account jobs', () => {
  beforeEach(() => {
    queueBroker.configure({ disableAll: false, logSkipped: false });
    bankAccounts.getSyncable.mockReset();
  });

  afterEach(() => {
    queueBroker.configure({ disableAll: true, logSkipped: true });
    vi.restoreAllMocks();
  });

  it('queues only account-scoped identifiers and trigger context', async () => {
    const add = vi
      .spyOn(transactionSyncQueue, 'add')
      .mockResolvedValue({ id: 'job-1' } as never);

    await scheduleTransactionSync({
      bankAccountId: 'account-1',
      trigger: 'manual',
      actorUserId: 'user-1',
    });

    expect(add).toHaveBeenCalledWith(
      'sync-bank-account',
      expect.objectContaining({
        bankAccountId: 'account-1',
        trigger: 'manual',
        actorUserId: 'user-1',
      }),
      expect.any(Object),
    );
    const data = add.mock.calls[0]?.[1];
    expect(data).not.toHaveProperty('companyId');
    expect(data).not.toHaveProperty('credentialId');
    expect(data).not.toHaveProperty('accessToken');
    expect(data).not.toHaveProperty('cursor');
    expect(data).not.toHaveProperty('providerBankAccountId');
  });

  it('fans a credential event out once per eligible account', async () => {
    bankAccounts.getSyncable.mockResolvedValue([
      {
        id: 'account-1',
        company_id: 'company-1',
        connection_credential_id: 'credential-1',
        last_sync_at: null,
      },
      {
        id: 'account-2',
        company_id: 'company-1',
        connection_credential_id: 'credential-1',
        last_sync_at: null,
      },
    ]);
    const add = vi.spyOn(transactionSyncQueue, 'add').mockImplementation(
      async (_name, data) =>
        ({
          id: `job:${(data as { bankAccountId: string }).bankAccountId}`,
        }) as never,
    );

    await scheduleSyncForCredential({
      credentialId: 'credential-1',
      trigger: 'webhook',
    });

    expect(bankAccounts.getSyncable).toHaveBeenCalledWith({
      credentialId: 'credential-1',
    });
    expect(add).toHaveBeenCalledTimes(2);
    expect(add.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({
        bankAccountId: 'account-1',
        trigger: 'webhook',
      }),
      expect.objectContaining({
        bankAccountId: 'account-2',
        trigger: 'webhook',
      }),
    ]);
  });

  it('configures retries to continue beyond the account lock TTL', () => {
    const retryWindowMs =
      BANK_ACCOUNT_SYNC_JOB_BACKOFF.delay *
      (2 ** (BANK_ACCOUNT_SYNC_JOB_ATTEMPTS - 1) - 1);
    expect(retryWindowMs).toBeGreaterThan(
      BANK_ACCOUNT_SYNC_LOCK_TTL_SECONDS * 1000,
    );
  });
});
