import { beforeEach, describe, expect, it, vi } from 'vitest';

import { connectAccountsService } from '../connect-accounts.service.js';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  transactionCommitted: false,
  createConnection: vi.fn(),
  createConnectionSecret: vi.fn(),
  getReauthorizationContext: vi.fn(),
  loadReauthorizationSecret: vi.fn(),
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
  stopFeed: vi.fn(),
  revokeConnection: vi.fn(),
  resolveReconnectAttention: vi.fn(),
  resolveHistoryImportAttention: vi.fn(),
  lockedConnectionStatus: 'requires_action',
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
  latestTransactionDateByAccount: new Map<string, string>(),
  bankAccountIdsWithPriorFeeds: new Set<string>(),
}));

vi.mock('../../../../db/knexClient.js', () => ({
  knexClient: { transaction: mocks.transaction },
}));

vi.mock(
  '../../../../domains/banking/bank-connections/bank-connections.model.js',
  () => ({
    createBankConnection: mocks.createConnection,
    getBankConnectionReauthorizationContext: mocks.getReauthorizationContext,
  }),
);

vi.mock(
  '../../../../domains/banking/bank-connection-secrets/bank-connection-secrets.model.js',
  () => ({
    createBankConnectionSecret: mocks.createConnectionSecret,
    loadSecretForConnectionReauthorization: mocks.loadReauthorizationSecret,
  }),
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
    stopFeedAndCancelSync: mocks.stopFeed,
    revokeConnectionAndDestroySecret: mocks.revokeConnection,
  }),
);

vi.mock(
  '../../../../domains/banking/bankAccounts/bankAccountNotifications.js',
  () => ({
    resolveBankReconnectAttention: mocks.resolveReconnectAttention,
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
    if (table === 'bank_connections') {
      return {
        where: vi.fn().mockReturnThis(),
        forUpdate: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          authorization_status: mocks.lockedConnectionStatus,
        }),
      };
    }
    if (table === 'bank_accounts') {
      return {
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ display_name: 'Omitted Account' }),
      };
    }
    if (table === 'bank_transactions') {
      let bankAccountId: string | undefined;
      const query = {
        where: vi.fn((conditions: { bank_account_id?: string }) => {
          bankAccountId = conditions.bank_account_id;
          return query;
        }),
        max: vi.fn().mockReturnThis(),
        first: vi.fn(async () => ({
          latest_transaction_date: bankAccountId
            ? (mocks.latestTransactionDateByAccount.get(bankAccountId) ?? null)
            : null,
        })),
      };
      return query;
    }
    if (table === 'bank_account_feeds') {
      let bankAccountId: string | undefined;
      const query = {
        where: vi.fn((conditions: { bank_account_id?: string }) => {
          bankAccountId = conditions.bank_account_id;
          return query;
        }),
        whereIn: vi.fn(),
        select: vi.fn(),
        first: vi.fn(async () =>
          bankAccountId && mocks.bankAccountIdsWithPriorFeeds.has(bankAccountId)
            ? { id: 'prior-feed' }
            : undefined,
        ),
      };
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
    mocks.getReauthorizationContext.mockResolvedValue({
      success: true,
      data: {
        providerKey: 'plaid',
        providerItemId: 'item-1',
        countryCode: 'US',
        bankId: 'bank-1',
      },
    });
    mocks.loadReauthorizationSecret.mockResolvedValue({
      success: true,
      data: { access_token: 'access-token' },
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
    mocks.latestTransactionDateByAccount.clear();
    mocks.bankAccountIdsWithPriorFeeds.clear();
    mocks.reactivateConnection.mockResolvedValue({ success: true });
    mocks.ensureSecret.mockResolvedValue({ success: true });
    mocks.bumpFeedVersions.mockResolvedValue(undefined);
    mocks.reactivateFeed.mockResolvedValue({ success: true });
    mocks.stopFeed.mockResolvedValue({
      success: true,
      data: {
        id: 'feed-3',
        alreadyStopped: false,
        bankAccountId: 'account-3',
      },
    });
    mocks.revokeConnection.mockResolvedValue({
      success: true,
      data: { alreadyRevoked: false },
    });
    mocks.resolveReconnectAttention.mockResolvedValue(undefined);
    mocks.resolveHistoryImportAttention.mockResolvedValue(undefined);
    mocks.lockedConnectionStatus = 'requires_action';
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
      .mockReset()
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
    expect(result.data?.accounts).toEqual([
      expect.objectContaining({ id: 'account-1', linkage: 'new' }),
      expect.objectContaining({ id: 'account-2', linkage: 'new' }),
    ]);
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

  it('starts after existing manual transactions and disables overlapping history', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-19T12:00:00.000Z'));
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
          providerAccount('provider-account-1', 'Existing Manual Account'),
        ],
      }),
      supportsTransactionSync: vi.fn(() => true),
    });
    mocks.createAccount.mockReset().mockResolvedValue({
      success: true,
      data: { bankAccountId: 'account-1', wasUpdated: true },
    });
    mocks.latestTransactionDateByAccount.set('account-1', '2026-07-19');

    try {
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
          data: expect.objectContaining({ sync_from_date: '2026-07-20' }),
        }),
      );
      expect(mocks.markHistoryImportStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          bankAccountFeedId: 'feed-1',
          companyId: 'company-1',
          status: 'unavailable',
          onlyIfStatus: 'collecting',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not treat a previously connected account as manual after a provider-id change', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-19T12:00:00.000Z'));
    mocks.classifyConnect.mockResolvedValue({
      kind: 'reauth',
      connectionId: 'connection-1',
    });
    mocks.existingFeeds = [
      {
        id: 'old-feed',
        provider_account_id: 'old-provider-account',
        bank_account_id: 'account-1',
        revoked_at: null,
      },
    ];
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
          providerAccount('new-provider-account', 'Previously Connected'),
        ],
      }),
      supportsTransactionSync: vi.fn(() => true),
    });
    mocks.createAccount.mockReset().mockResolvedValue({
      success: true,
      data: { bankAccountId: 'account-1', wasUpdated: true },
    });
    mocks.latestTransactionDateByAccount.set('account-1', '2026-07-19');
    mocks.bankAccountIdsWithPriorFeeds.add('account-1');

    try {
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
          data: expect.objectContaining({ sync_from_date: '2026-07-19' }),
        }),
      );
      expect(mocks.markHistoryImportStatus).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
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

  it('stops an existing feed omitted from the reauthorization selection', async () => {
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
      {
        id: 'feed-3',
        provider_account_id: 'provider-account-3',
        bank_account_id: 'account-3',
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
    expect(result.data?.accounts.map((account) => account.id)).toEqual([
      'account-1',
      'account-2',
    ]);
    expect(mocks.stopFeed).toHaveBeenCalledWith({
      feedId: 'feed-3',
      companyId: 'company-1',
      revokedById: 'user-1',
      revocationOrigin: 'client',
      revocationReason: 'Omitted during bank reauthorization',
      trx: expect.anything(),
    });
    expect(mocks.resolveReconnectAttention).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        bankAccountId: 'account-3',
      }),
    );
  });

  it('completes update-mode reauthorization from the provider account set', async () => {
    mocks.createAccount.mockReset().mockResolvedValue({
      success: true,
      data: { bankAccountId: 'account-2', wasUpdated: false },
    });
    mocks.existingFeeds = [
      {
        id: 'feed-1',
        provider_account_id: 'provider-account-1',
        bank_account_id: 'account-1',
        revoked_at: null,
      },
      {
        id: 'feed-3',
        provider_account_id: 'provider-account-3',
        bank_account_id: 'account-3',
        revoked_at: null,
      },
    ];

    const result = await connectAccountsService.completeReauthorization({
      connectionId: 'connection-1',
      companyId: 'company-1',
      userId: 'user-1',
    });

    expect(result.success).toBe(true);
    expect(result.data?.outcome).toBe('reauthorized');
    expect(result.data?.accounts.map((account) => account.id)).toEqual([
      'account-1',
      'account-2',
    ]);
    expect(mocks.stopFeed).toHaveBeenCalledWith(
      expect.objectContaining({ feedId: 'feed-3' }),
    );
    expect(mocks.createFeed).toHaveBeenCalledTimes(1);
  });

  it('makes no local changes when the provider returns no accounts', async () => {
    const getConnectionDetails = vi.fn().mockResolvedValue({
      connection: { id: 'item-1', metadata: {} },
      institution: {
        systemInstitutionId: 'bank-1',
        providerInstitutionId: 'institution-1',
        name: 'Test Bank',
        countryCode: 'US',
        rawData: {},
      },
      bankAccounts: [],
    });
    mocks.getProvider.mockResolvedValue({
      getConnectionDetails,
      supportsTransactionSync: vi.fn(() => true),
    });

    const result = await connectAccountsService.completeReauthorization({
      connectionId: 'connection-1',
      companyId: 'company-1',
      userId: 'user-1',
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('OPERATION_NOT_ALLOWED');
    expect(getConnectionDetails).toHaveBeenCalledWith(
      expect.objectContaining({ knownBankId: 'bank-1' }),
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.reactivateConnection).not.toHaveBeenCalled();
    expect(mocks.stopFeed).not.toHaveBeenCalled();
  });

  it('does not resurrect a connection revoked during provider reauthorization', async () => {
    mocks.lockedConnectionStatus = 'revoked';

    const result = await connectAccountsService.completeReauthorization({
      connectionId: 'connection-1',
      companyId: 'company-1',
      userId: 'user-1',
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('OPERATION_NOT_ALLOWED');
    expect(mocks.reactivateConnection).not.toHaveBeenCalled();
    expect(mocks.ensureSecret).not.toHaveBeenCalled();
    expect(mocks.stopFeed).not.toHaveBeenCalled();
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
      expect(result.data?.accounts[0]).toEqual(
        expect.objectContaining({
          id: 'account-1',
          linkage: 'existing',
        }),
      );
      expect(result.message).toMatch(/existing account/i);
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
