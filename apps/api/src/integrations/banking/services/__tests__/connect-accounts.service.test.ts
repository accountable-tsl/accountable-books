import { beforeEach, describe, expect, it, vi } from 'vitest';

import { connectAccountsService } from '../connect-accounts.service.js';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  transactionCommitted: false,
  createCredential: vi.fn(),
  createAccount: vi.fn(),
  getProvider: vi.fn(),
  getEnabledProvider: vi.fn(),
  scheduleSync: vi.fn(),
}));

vi.mock('../../../../db/knexClient.js', () => ({
  knexClient: { transaction: mocks.transaction },
}));

vi.mock(
  '../../../../domains/banking/bankAccountCredentials/bankAccountCredentials.model.js',
  () => ({ createBankAccountCredential: mocks.createCredential }),
);

vi.mock(
  '../../../../domains/banking/bankAccounts/bankAccounts.model.js',
  () => ({ createBankAccountWithConnection: mocks.createAccount }),
);

vi.mock('../../jobs/transaction-sync.queue.js', () => ({
  scheduleTransactionSync: mocks.scheduleSync,
}));

vi.mock('../../providers/registry.js', () => ({
  providerRegistry: {
    get: mocks.getProvider,
    getEnabledProvider: mocks.getEnabledProvider,
  },
}));

describe('connected account initial synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transactionCommitted = false;
    mocks.transaction.mockImplementation(async (callback) => {
      const result = await callback({});
      mocks.transactionCommitted = true;
      return result;
    });
    mocks.createCredential.mockResolvedValue({
      success: true,
      data: { id: 'credential-1' },
    });
    mocks.getEnabledProvider.mockResolvedValue({
      id: 'provider-1',
      name: 'Plaid',
      countries: [{ code: 'US' }],
    });
    mocks.getProvider.mockResolvedValue({
      exchangeToken: vi.fn().mockResolvedValue({
        accessToken: 'access-token',
        itemId: 'item-1',
      }),
      getConnectionDetails: vi.fn().mockResolvedValue({
        connection: { id: 'item-1', metadata: {} },
        institution: {
          systemInstitutionId: 'bank-1',
          providerInstitutionId: 'institution-1',
          name: 'Test Bank',
          countryCode: 'US',
          rawData: {},
        },
        bankAccounts: [
          providerAccount('provider-account-1', 'Account One'),
          providerAccount('provider-account-2', 'Account Two'),
        ],
      }),
      supportsTransactionSync: vi.fn(() => true),
    });
    mocks.createAccount
      .mockResolvedValueOnce({
        success: true,
        data: { bankAccountId: 'account-1', wasUpdated: false },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { bankAccountId: 'account-2', wasUpdated: false },
      });
  });

  it('queues one delayed account job only after the connection commits', async () => {
    mocks.scheduleSync.mockImplementation(async () => {
      expect(mocks.transactionCommitted).toBe(true);
      return { id: 'job-1' };
    });

    const result = await connectAccountsService.connectBankAccounts({
      providerKey: 'plaid',
      countryCode: 'US',
      publicToken: 'public-token',
      companyId: 'company-1',
      userId: 'user-1',
    });

    expect(result.success).toBe(true);
    expect(mocks.scheduleSync).toHaveBeenCalledTimes(2);
    expect(mocks.scheduleSync.mock.calls).toEqual([
      [
        {
          bankAccountId: 'account-1',
          trigger: 'initial',
          actorUserId: 'user-1',
        },
        { delay: 5000 },
      ],
      [
        {
          bankAccountId: 'account-2',
          trigger: 'initial',
          actorUserId: 'user-1',
        },
        { delay: 5000 },
      ],
    ]);
  });

  it('does not queue initial work when account creation rolls back', async () => {
    mocks.createAccount
      .mockReset()
      .mockResolvedValueOnce({
        success: true,
        data: { bankAccountId: 'account-1', wasUpdated: false },
      })
      .mockResolvedValueOnce({
        success: false,
        message: 'second account failed',
      });

    const result = await connectAccountsService.connectBankAccounts({
      providerKey: 'plaid',
      countryCode: 'US',
      publicToken: 'public-token',
      companyId: 'company-1',
      userId: 'user-1',
    });

    expect(result.success).toBe(false);
    expect(mocks.transactionCommitted).toBe(false);
    expect(mocks.scheduleSync).not.toHaveBeenCalled();
  });
});

function providerAccount(accountId: string, displayName: string) {
  return {
    accountId,
    displayName,
    officialName: displayName,
    accountNumber: accountId,
    mask: accountId.slice(-4),
    currencyCode: 'USD',
    type: 'checkings_current',
    rawData: {},
    balance: 100,
    balanceDate: new Date('2026-01-01T00:00:00Z'),
  };
}
