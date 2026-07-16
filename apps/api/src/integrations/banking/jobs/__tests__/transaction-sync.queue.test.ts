import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queueBroker } from '../../../../jobs/queues/queue-broker.js';
import {
  BANK_ACCOUNT_SYNC_JOB_ATTEMPTS,
  BANK_ACCOUNT_SYNC_JOB_BACKOFF,
  BANK_ACCOUNT_SYNC_LOCK_TTL_SECONDS,
} from '../../transaction-sync.constants.js';
import { enqueuePeriodicBankSyncIntents } from '../transaction-sync.queue.js';

const mocks = vi.hoisted(() => ({
  getSyncable: vi.fn(),
  requestBankAccountSync: vi.fn(),
}));

vi.mock(
  '../../../../domains/banking/bankAccounts/bankAccounts.model.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../domains/banking/bankAccounts/bankAccounts.model.js')
    >()),
    getSyncableBankAccounts: mocks.getSyncable,
  }),
);

vi.mock('../../transaction-sync.outbox.js', () => ({
  requestBankAccountSync: mocks.requestBankAccountSync,
}));

describe('periodic bank sync wake', () => {
  beforeEach(() => {
    queueBroker.configure({ disableAll: false, logSkipped: false });
    mocks.getSyncable.mockReset();
    mocks.requestBankAccountSync.mockReset();
    mocks.requestBankAccountSync.mockResolvedValue({ id: 'outbox-1' });
  });

  it('writes one outbox sync intent per syncable account', async () => {
    mocks.getSyncable.mockResolvedValue([
      { id: 'account-1' },
      { id: 'account-2' },
    ]);

    const result = await enqueuePeriodicBankSyncIntents();

    expect(result).toEqual({ accountCount: 2, failedCount: 0 });
    expect(mocks.requestBankAccountSync).toHaveBeenCalledTimes(2);
    expect(mocks.requestBankAccountSync.mock.calls).toEqual([
      [{ bankAccountId: 'account-1', trigger: 'periodic' }],
      [{ bankAccountId: 'account-2', trigger: 'periodic' }],
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
