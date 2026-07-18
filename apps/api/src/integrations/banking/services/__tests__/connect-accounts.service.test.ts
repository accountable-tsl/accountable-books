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
  deleteAllHistoryCandidates: vi.fn(),
  refreshHistoryImportAggregates: vi.fn(),
  markHistoryImportStatus: vi.fn(),
  writeSyncOutbox: vi.fn(),
  updateProviderReportedBalance: vi.fn(),
  getProvider: vi.fn(),
  getEnabledProvider: vi.fn(),
  classifyConnect: vi.fn(),
  reactivateConnection: vi.fn(),
  ensureSecret: vi.fn(),
  bumpFeedVersions: vi.fn(),
  reactivateFeed: vi.fn(),
  revokeConnection: vi.fn(),
  writeReconnectNotification: vi.fn(),
  resolveHistoryImportAttention: vi.fn(),
  predecessorFeeds: [] as Array<{
    id: string;
    sync_from_date: string | null;
    sync_from_timezone: string;
  }>,
  existingFeeds: [] as Array<{
    id: string;
    provider_account_id: string;
    bank_account_id: string;
    revoked_at: Date | null;
  }>,
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
  () => ({
    createHistoryImport: mocks.createHistoryImport,
    deleteAllHistoryCandidates: mocks.deleteAllHistoryCandidates,
    refreshHistoryImportAggregates: mocks.refreshHistoryImportAggregates,
    markHistoryImportStatus: mocks.markHistoryImportStatus,
  }),
);

vi.mock('../../transaction-sync.outbox.js', () => ({
  writeBankSyncOutbox: mocks.writeSyncOutbox,
}));

vi.mock('../../../../domains/balances/bank-current-balance.js', () => ({
  updateProviderReportedBalance: mocks.updateProviderReportedBalance,
}));

vi.mock('../../../../domains/banking/connection-lifecycle/classify.js', () => ({
  classifyConnectEvent: mocks.classifyConnect,
}));

vi.mock(
  '../../../../domains/banking/connection-lifecycle/lifecycle.commands.js',
  () => ({
    reactivateConnectionForReauth: mocks.reactivateConnection,
    ensureActiveConnectionSecret: mocks.ensureSecret,
    bumpActiveFeedStateVersions: mocks.bumpFeedVersions,
    reactivateFeedForReauth: mocks.reactivateFeed,
    revokeConnectionAndDestroySecret: mocks.revokeConnection,
  }),
);

vi.mock(
  '../../../../domains/banking/bankAccounts/bankAccountNotifications.js',
  () => ({
    writeBankReconnectNotificationLifecycle: mocks.writeReconnectNotification,
    resolveHistoryImportAttention: mocks.resolveHistoryImportAttention,
  }),
);

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
    if (table === 'bank_connection_secrets') {
      return {
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: 'secret-1' }),
      };
    }
    if (table === 'bank_account_feeds') {
      const query = {
        where: vi.fn(),
        whereIn: vi.fn(),
        select: vi.fn(),
      };
      query.where.mockReturnValue(query);
      query.whereIn.mockReturnValue(query);
      query.select.mockImplementation(() =>
        query.whereIn.mock.calls.length > 0
          ? Promise.resolve(mocks.predecessorFeeds)
          : Promise.resolve(mocks.existingFeeds),
      );
      return query;
    }
    if (table === 'bank_account_feeds as baf') {
      const query = {
        join: vi.fn(),
        where: vi.fn(),
        whereNull: vi.fn(),
        whereNot: vi.fn(),
        first: vi.fn().mockResolvedValue(undefined),
      };
      query.join.mockReturnValue(query);
      query.where.mockReturnValue(query);
      query.whereNull.mockReturnValue(query);
      query.whereNot.mockReturnValue(query);
      return query;
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
    mocks.deleteAllHistoryCandidates.mockResolvedValue(0);
    mocks.refreshHistoryImportAggregates.mockResolvedValue(undefined);
    mocks.markHistoryImportStatus.mockResolvedValue(true);
    mocks.writeSyncOutbox.mockResolvedValue(undefined);
    mocks.updateProviderReportedBalance.mockResolvedValue(undefined);
    mocks.classifyConnect.mockResolvedValue({ kind: 'first' });
    mocks.existingFeeds = [];
    mocks.reactivateConnection.mockResolvedValue({ success: true });
    mocks.ensureSecret.mockResolvedValue({ success: true });
    mocks.bumpFeedVersions.mockResolvedValue(undefined);
    mocks.reactivateFeed.mockResolvedValue({ success: true });
    mocks.revokeConnection.mockResolvedValue({
      success: true,
      data: { alreadyRevoked: false },
    });
    mocks.writeReconnectNotification.mockResolvedValue(undefined);
    mocks.resolveHistoryImportAttention.mockResolvedValue(undefined);
    mocks.predecessorFeeds = [];
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
    expect(mocks.updateProviderReportedBalance).not.toHaveBeenCalled();
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

    expect(mocks.updateProviderReportedBalance).toHaveBeenCalledWith(
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

  it('returns needs_confirmation without writes when replace is ambiguous', async () => {
    mocks.classifyConnect.mockResolvedValue({
      kind: 'needs_confirmation',
      reason: 'overlap across multiple connections',
      proposed: {
        oldConnectionIds: ['old-1', 'old-2'],
        mappings: [],
      },
    });

    const result = await connectAccountsService.connectBankAccounts({
      providerKey: 'plaid',
      countryCode: 'US',
      publicToken: 'public-token',
      companyId: 'company-1',
      userId: 'user-1',
    });

    expect(result.success).toBe(true);
    expect(result.data?.outcome).toBe('needs_confirmation');
    expect(result.data?.confirmation?.oldConnectionIds).toEqual([
      'old-1',
      'old-2',
    ]);
    expect(mocks.createConnection).not.toHaveBeenCalled();
    expect(mocks.writeSyncOutbox).not.toHaveBeenCalled();
    expect(mocks.revokeConnection).not.toHaveBeenCalled();
  });

  it('reauthorizes same item with non-initial sync and no new history offer', async () => {
    mocks.classifyConnect.mockResolvedValue({
      kind: 'reauth',
      connectionId: 'connection-1',
    });
    mocks.existingFeeds = [
      {
        id: 'feed-1',
        provider_account_id: 'provider-account-1',
        bank_account_id: 'account-1',
        revoked_at: null,
      },
      {
        id: 'feed-2',
        provider_account_id: 'provider-account-2',
        bank_account_id: 'account-2',
        revoked_at: null,
      },
    ];

    const result = await connectAccountsService.connectBankAccounts({
      providerKey: 'plaid',
      countryCode: 'US',
      publicToken: 'public-token',
      companyId: 'company-1',
      userId: 'user-1',
    });

    expect(result.success).toBe(true);
    expect(result.data?.outcome).toBe('reauthorized');
    expect(mocks.createConnection).not.toHaveBeenCalled();
    expect(mocks.createHistoryImport).not.toHaveBeenCalled();
    expect(mocks.createFeed).not.toHaveBeenCalled();
    expect(mocks.ensureSecret).toHaveBeenCalled();
    expect(mocks.writeSyncOutbox.mock.calls).toEqual([
      [
        expect.anything(),
        {
          bankAccountId: 'account-1',
          trigger: 'manual',
          actorUserId: 'user-1',
        },
      ],
      [
        expect.anything(),
        {
          bankAccountId: 'account-2',
          trigger: 'manual',
          actorUserId: 'user-1',
        },
      ],
    ]);
  });

  it.each(['2025-04-01', null])(
    'keeps the accepted transaction boundary when replacing a feed',
    async (acceptedBoundary) => {
      mocks.classifyConnect.mockResolvedValue({
        kind: 'replace',
        oldConnectionId: 'old-connection',
        mappings: [
          {
            oldFeedId: 'old-feed',
            oldConnectionId: 'old-connection',
            bankAccountId: 'account-1',
            providerAccountId: 'provider-account-1',
          },
        ],
      });
      mocks.predecessorFeeds = [
        {
          id: 'old-feed',
          sync_from_date: acceptedBoundary,
          sync_from_timezone: 'Europe/London',
        },
      ];
      mocks.createAccount.mockReset().mockResolvedValue({
        success: true,
        data: { bankAccountId: 'account-1', wasUpdated: true },
      });
      mocks.createFeed.mockReset().mockResolvedValue({
        success: true,
        data: { id: 'replacement-feed' },
      });

      const result = await connectAccountsService.connectBankAccounts({
        providerKey: 'plaid',
        countryCode: 'US',
        publicToken: 'public-token',
        companyId: 'company-1',
        userId: 'user-1',
      });

      expect(result.success).toBe(true);
      expect(mocks.createFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sync_from_date: acceptedBoundary,
            sync_from_timezone: 'Europe/London',
            replaces_bank_account_feed_id: 'old-feed',
          }),
        }),
      );
    },
  );
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
