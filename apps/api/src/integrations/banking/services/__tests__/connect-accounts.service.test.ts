import { beforeEach, describe, expect, it, vi } from 'vitest';

import { connectAccountsService } from '../connect-accounts.service.js';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  transactionCommitted: false,
  createConnection: vi.fn(),
  createConnectionSecret: vi.fn(),
  createAccount: vi.fn(),
  createFeed: vi.fn(),
  createHistoryImport: vi.fn(),
  writeSyncOutbox: vi.fn(),
  updateBankCurrentBalance: vi.fn(),
  getProvider: vi.fn(),
  getEnabledProvider: vi.fn(),
}));

vi.mock('../../../../db/knexClient.js', () => ({
  knexClient: { transaction: mocks.transaction },
}));

vi.mock(
  '../../../../domains/banking/bank-connections/bank-connections.model.js',
  () => ({ createBankConnection: mocks.createConnection }),
);

vi.mock(
  '../../../../domains/banking/bank-connection-secrets/bank-connection-secrets.model.js',
  () => ({ createBankConnectionSecret: mocks.createConnectionSecret }),
);

vi.mock(
  '../../../../domains/banking/bankAccounts/bankAccounts.model.js',
  () => ({ createBankAccountWithConnection: mocks.createAccount }),
);

vi.mock(
  '../../../../domains/banking/bank-account-feeds/bank-account-feeds.model.js',
  () => ({ createBankAccountFeed: mocks.createFeed }),
);

vi.mock(
  '../../../../domains/banking/bank-transaction-history/bank-transaction-history.model.js',
  () => ({ createHistoryImport: mocks.createHistoryImport }),
);

vi.mock('../../transaction-sync.outbox.js', () => ({
  writeBankSyncOutbox: mocks.writeSyncOutbox,
}));

vi.mock('../../../../domains/balances/bank-current-balance.js', () => ({
  updateBankCurrentBalance: mocks.updateBankCurrentBalance,
}));

vi.mock('../../providers/registry.js', () => ({
  providerRegistry: {
    get: mocks.getProvider,
    getEnabledProvider: mocks.getEnabledProvider,
  },
}));

function makeTrx() {
  return vi.fn((table: string) => {
    if (table === 'companies') {
      return {
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ default_timezone: 'Etc/UTC' }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe('connected account initial synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transactionCommitted = false;
    mocks.transaction.mockImplementation(async (callback) => {
      try {
        const result = await callback(makeTrx());
        mocks.transactionCommitted = true;
        return result;
      } catch (error) {
        mocks.transactionCommitted = false;
        throw error;
      }
    });
    mocks.createConnection.mockResolvedValue({
      success: true,
      data: { id: 'connection-1' },
    });
    mocks.createConnectionSecret.mockResolvedValue({
      success: true,
      data: { id: 'secret-1' },
    });
    mocks.createFeed.mockResolvedValue({
      success: true,
      data: { id: 'feed-1' },
    });
    mocks.createHistoryImport.mockResolvedValue(undefined);
    mocks.writeSyncOutbox.mockResolvedValue(undefined);
    mocks.updateBankCurrentBalance.mockResolvedValue(undefined);
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

  it('writes initial-sync outbox intents inside the connect transaction', async () => {
    const result = await connectAccountsService.connectBankAccounts({
      providerKey: 'plaid',
      countryCode: 'US',
      publicToken: 'public-token',
      companyId: 'company-1',
      userId: 'user-1',
    });

    expect(result.success).toBe(true);
    expect(mocks.createHistoryImport).toHaveBeenCalledTimes(2);
    expect(mocks.writeSyncOutbox).toHaveBeenCalledTimes(2);
    expect(mocks.writeSyncOutbox.mock.calls).toEqual([
      [
        expect.anything(),
        {
          bankAccountId: 'account-1',
          trigger: 'initial',
          actorUserId: 'user-1',
        },
      ],
      [
        expect.anything(),
        {
          bankAccountId: 'account-2',
          trigger: 'initial',
          actorUserId: 'user-1',
        },
      ],
    ]);
    expect(mocks.updateBankCurrentBalance).not.toHaveBeenCalled();
  });

  it('stores native balance when the provider supplies reportedCurrentBalance', async () => {
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
          {
            ...providerAccount('provider-account-1', 'Account One'),
            reportedCurrentBalance: {
              amount: 2500,
              asOf: new Date('2026-01-01T00:00:00Z'),
            },
          },
        ],
      }),
      supportsTransactionSync: vi.fn(() => true),
    });
    mocks.createAccount.mockReset().mockResolvedValue({
      success: true,
      data: { bankAccountId: 'account-1', wasUpdated: false },
    });

    await connectAccountsService.connectBankAccounts({
      providerKey: 'plaid',
      countryCode: 'US',
      publicToken: 'public-token',
      companyId: 'company-1',
      userId: 'user-1',
    });

    expect(mocks.updateBankCurrentBalance).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        bankAccountId: 'account-1',
        balance: 2500,
      }),
    );
  });

  it('does not write initial-sync intents when account creation rolls back', async () => {
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
    expect(mocks.writeSyncOutbox).toHaveBeenCalledTimes(1);
  });

  it('does not create accounts or outbox intents when secret creation rolls back the connection', async () => {
    mocks.createConnectionSecret.mockResolvedValueOnce({
      success: false,
      message: 'secret write failed',
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
    expect(mocks.createAccount).not.toHaveBeenCalled();
    expect(mocks.createFeed).not.toHaveBeenCalled();
    expect(mocks.writeSyncOutbox).not.toHaveBeenCalled();
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
