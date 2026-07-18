import { describe, expect, it, vi } from 'vitest';

import { MonoProvider } from '../mono.provider.js';
import { PlaidProvider } from '../plaid.provider.js';

function stubTransactionsSync(
  provider: PlaidProvider,
  implementation: ReturnType<typeof vi.fn>,
): void {
  (
    provider as unknown as {
      client: { transactionsSync: typeof implementation };
    }
  ).client.transactionsSync = implementation;
}

function stubLinkTokenCreate(
  provider: PlaidProvider,
  implementation: ReturnType<typeof vi.fn>,
): void {
  (
    provider as unknown as {
      client: { linkTokenCreate: typeof implementation };
    }
  ).client.linkTokenCreate = implementation;
}

function plaidPage(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      accounts: [],
      added: [],
      modified: [],
      removed: [],
      next_cursor: 'next-account-cursor',
      has_more: false,
      transactions_update_status: 'INITIAL_UPDATE_COMPLETE',
      ...overrides,
    },
  };
}

function plaidTransaction(overrides: Record<string, unknown> = {}) {
  return {
    transaction_id: 'txn-1',
    account_id: 'plaid-account-1',
    date: '2026-01-15',
    datetime: null,
    amount: 12.5,
    merchant_name: 'Coffee',
    original_description: 'COFFEE SHOP',
    iso_currency_code: 'USD',
    pending: false,
    personal_finance_category: null,
    payment_channel: 'in store',
    location: {},
    ...overrides,
  };
}

describe('PlaidProvider link tokens', () => {
  it('uses update mode when repairing an existing connection', async () => {
    const provider = new PlaidProvider();
    const linkTokenCreate = vi.fn().mockResolvedValue({
      data: { link_token: 'update-link-token' },
    });
    stubLinkTokenCreate(provider, linkTokenCreate);

    const token = await provider.createLinkToken({
      userId: 'user-1',
      companyId: 'company-1',
      accessToken: 'existing-access-token',
    });

    expect(token).toBe('update-link-token');
    expect(linkTokenCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        access_token: 'existing-access-token',
        update: { account_selection_enabled: true },
      }),
    );
    expect(linkTokenCreate.mock.calls[0][0]).not.toHaveProperty('products');
    expect(linkTokenCreate.mock.calls[0][0]).not.toHaveProperty('transactions');
  });
});

describe('PlaidProvider connection details', () => {
  it('does not resolve a bank mapping when no accounts were returned', async () => {
    const provider = new PlaidProvider();
    Object.assign(provider as unknown as Record<string, unknown>, {
      getItemDetails: vi.fn().mockResolvedValue({
        itemId: 'item-1',
        institutionId: 'institution-1',
        institutionName: 'Test Bank',
      }),
      getInstitutionById: vi.fn().mockResolvedValue({
        providerInstitutionId: 'institution-1',
        name: 'Test Bank',
        countryCode: 'US',
        rawData: {},
      }),
      fetchBankAccounts: vi.fn().mockResolvedValue([]),
    });

    await expect(
      provider.getConnectionDetails({
        accessToken: 'access-token',
        countryCode: 'US',
        userId: 'user-1',
      }),
    ).rejects.toThrow('Provider returned no bank accounts');
  });
});

describe('PlaidProvider transaction update fetch', () => {
  it('requests the independent stream for the supplied bank account', async () => {
    const provider = new PlaidProvider();
    const transactionsSync = vi.fn().mockResolvedValue(plaidPage());
    stubTransactionsSync(provider, transactionsSync);

    await provider.fetchTransactionUpdate({
      accessToken: 'access-token',
      providerBankAccountId: 'plaid-account-1',
      checkpoint: 'account-cursor',
      lastSuccessfulSyncAt: null,
      isInitialSync: false,
    });

    expect(transactionsSync).toHaveBeenCalledWith({
      access_token: 'access-token',
      cursor: 'account-cursor',
      count: 500,
      options: {
        account_id: 'plaid-account-1',
        include_original_description: true,
        include_personal_finance_category: true,
      },
    });
  });

  it('paginates internally, flattens added and modified, and maps history status', async () => {
    const provider = new PlaidProvider();
    const transactionsSync = vi
      .fn()
      .mockResolvedValueOnce(
        plaidPage({
          added: [plaidTransaction({ transaction_id: 'txn-a' })],
          next_cursor: 'page-2',
          has_more: true,
        }),
      )
      .mockResolvedValueOnce(
        plaidPage({
          modified: [plaidTransaction({ transaction_id: 'txn-b' })],
          removed: [{ transaction_id: 'txn-gone' }],
          next_cursor: 'final-cursor',
          has_more: false,
          transactions_update_status: 'HISTORICAL_UPDATE_COMPLETE',
        }),
      );
    stubTransactionsSync(provider, transactionsSync);

    const update = await provider.fetchTransactionUpdate({
      accessToken: 'access-token',
      providerBankAccountId: 'plaid-account-1',
      checkpoint: null,
      lastSuccessfulSyncAt: null,
      isInitialSync: true,
    });

    expect(update.observedTransactions.map((t) => t.transactionId)).toEqual([
      'txn-a',
      'txn-b',
    ]);
    expect(update.removedTransactionIds).toEqual(['txn-gone']);
    expect(update.nextCheckpoint).toBe('final-cursor');
    expect(update.historyStatus).toBe('complete');
    expect(update.pageCount).toBe(2);
    // Second page resumed from the first page's cursor.
    expect(transactionsSync.mock.calls[1][0].cursor).toBe('page-2');
  });

  it('restarts from the original checkpoint when the stream mutates during pagination', async () => {
    const provider = new PlaidProvider();
    const mutationError = {
      response: {
        data: {
          error_code: 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION',
          error_message: 'Underlying transaction data changed',
        },
      },
    };
    const transactionsSync = vi
      .fn()
      .mockResolvedValueOnce(
        plaidPage({
          added: [plaidTransaction({ transaction_id: 'stale-txn' })],
          next_cursor: 'page-2',
          has_more: true,
        }),
      )
      .mockRejectedValueOnce(mutationError)
      .mockResolvedValueOnce(
        plaidPage({
          added: [plaidTransaction({ transaction_id: 'fresh-txn' })],
          next_cursor: 'stable-cursor',
          has_more: false,
        }),
      );
    stubTransactionsSync(provider, transactionsSync);

    const update = await provider.fetchTransactionUpdate({
      accessToken: 'access-token',
      providerBankAccountId: 'plaid-account-1',
      checkpoint: 'original-cursor',
      lastSuccessfulSyncAt: null,
      isInitialSync: false,
    });

    // The buffered first page was discarded; only the restarted fetch counts.
    expect(update.observedTransactions.map((t) => t.transactionId)).toEqual([
      'fresh-txn',
    ]);
    expect(update.nextCheckpoint).toBe('stable-cursor');
    expect(transactionsSync.mock.calls[0][0].cursor).toBe('original-cursor');
    expect(transactionsSync.mock.calls[2][0].cursor).toBe('original-cursor');
  });

  it('gives up after repeated mutation restarts', async () => {
    const provider = new PlaidProvider();
    const mutationError = {
      response: {
        data: {
          error_code: 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION',
          error_message: 'Underlying transaction data changed',
        },
      },
    };
    const transactionsSync = vi.fn().mockRejectedValue(mutationError);
    stubTransactionsSync(provider, transactionsSync);

    await expect(
      provider.fetchTransactionUpdate({
        accessToken: 'access-token',
        providerBankAccountId: 'plaid-account-1',
        checkpoint: 'original-cursor',
        lastSuccessfulSyncAt: null,
        isInitialSync: false,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION',
      }),
    );
    expect(transactionsSync).toHaveBeenCalledTimes(3);
  });

  it('fails closed when a page contains a transaction for another account', async () => {
    const provider = new PlaidProvider();
    const transactionsSync = vi.fn().mockResolvedValue(
      plaidPage({
        added: [plaidTransaction({ account_id: 'other-account' })],
        next_cursor: 'cursor',
      }),
    );
    stubTransactionsSync(provider, transactionsSync);

    await expect(
      provider.fetchTransactionUpdate({
        accessToken: 'access-token',
        providerBankAccountId: 'plaid-account-1',
        checkpoint: null,
        lastSuccessfulSyncAt: null,
        isInitialSync: true,
      }),
    ).rejects.toThrow(/for account other-account/);
  });

  it('reports a not-ready stream as collecting with no checkpoint', async () => {
    const provider = new PlaidProvider();
    const transactionsSync = vi.fn().mockResolvedValue(
      plaidPage({
        next_cursor: '',
        transactions_update_status: 'NOT_READY',
      }),
    );
    stubTransactionsSync(provider, transactionsSync);

    const update = await provider.fetchTransactionUpdate({
      accessToken: 'access-token',
      providerBankAccountId: 'plaid-account-1',
      checkpoint: null,
      lastSuccessfulSyncAt: null,
      isInitialSync: true,
    });

    expect(update).toMatchObject({
      observedTransactions: [],
      removedTransactionIds: [],
      nextCheckpoint: null,
      historyStatus: 'collecting',
    });
  });

  it('fails closed when no account ID is supplied at runtime', async () => {
    const provider = new PlaidProvider();
    const transactionsSync = vi.fn();
    stubTransactionsSync(provider, transactionsSync);

    await expect(
      provider.fetchTransactionUpdate({
        accessToken: 'access-token',
        providerBankAccountId: '',
        checkpoint: null,
        lastSuccessfulSyncAt: null,
        isInitialSync: true,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'PLAID_UNKNOWN_ERROR',
        message: 'Plaid transaction sync requires an account ID',
      }),
    );
    expect(transactionsSync).not.toHaveBeenCalled();
  });

  it('extracts Plaid error details from SDK response data', () => {
    const provider = new PlaidProvider();

    expect(
      provider.handleError({
        message: 'Request failed',
        response: {
          data: {
            error_code: 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION',
            error_message: 'Underlying transaction data changed',
          },
        },
      }),
    ).toEqual({
      code: 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION',
      message: 'Underlying transaction data changed',
      displayMessage:
        'An error occurred while connecting to your bank. Please try again.',
      retryable: true,
    });
  });
});

describe('PlaidProvider account balance mapping', () => {
  function mapAccounts(balances: {
    current: number | null;
    available: number | null;
    iso_currency_code: string;
  }) {
    const provider = new PlaidProvider();
    return (
      provider as unknown as {
        mapAuthGetResponse: (
          data: {
            accounts: Array<Record<string, unknown>>;
            numbers: Record<string, never>;
          },
          timestamp: Date,
        ) => Array<{
          balance: number;
          reportedCurrentBalance?: { amount: number; asOf: Date };
        }>;
      }
    ).mapAuthGetResponse(
      {
        accounts: [
          {
            account_id: 'acct-1',
            name: 'Checking',
            official_name: 'Checking',
            type: 'depository',
            subtype: 'checking',
            mask: '1234',
            balances,
          },
        ],
        numbers: {},
      },
      new Date('2026-07-16T12:00:00Z'),
    );
  }

  it('uses balances.current only; zero is valid and available is ignored', () => {
    const [zeroCurrent] = mapAccounts({
      current: 0,
      available: 999,
      iso_currency_code: 'USD',
    });
    expect(zeroCurrent.reportedCurrentBalance).toEqual({
      amount: 0,
      asOf: new Date('2026-07-16T12:00:00Z'),
    });

    const [missingCurrent] = mapAccounts({
      current: null,
      available: 50,
      iso_currency_code: 'USD',
    });
    expect(missingCurrent.reportedCurrentBalance).toBeUndefined();
  });
});

describe('MonoProvider transaction update fetch', () => {
  it('fails closed when the requested account does not match its token', async () => {
    const provider = new MonoProvider();

    await expect(
      provider.fetchTransactionUpdate({
        accessToken: 'mono-account-1',
        providerBankAccountId: 'mono-account-2',
        checkpoint: null,
        lastSuccessfulSyncAt: null,
        isInitialSync: true,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'MONO_UNKNOWN_ERROR',
        message:
          'Mono provider account does not match the connected account token',
      }),
    );
  });
});
