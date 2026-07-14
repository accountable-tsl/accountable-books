import { describe, expect, it, vi } from 'vitest';

import { MonoProvider } from '../mono.provider.js';
import { PlaidProvider } from '../plaid.provider.js';

describe('PlaidProvider transaction sync', () => {
  it('requests the independent stream for the supplied bank account', async () => {
    const provider = new PlaidProvider();
    const transactionsSync = vi.fn().mockResolvedValue({
      data: {
        accounts: [],
        added: [],
        modified: [],
        removed: [],
        next_cursor: 'next-account-cursor',
        has_more: false,
      },
    });
    (
      provider as unknown as {
        client: { transactionsSync: typeof transactionsSync };
      }
    ).client.transactionsSync = transactionsSync;

    await provider.syncTransactions({
      accessToken: 'access-token',
      providerBankAccountId: 'plaid-account-1',
      cursor: 'account-cursor',
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

  it('fails closed when no account ID is supplied at runtime', async () => {
    const provider = new PlaidProvider();
    const transactionsSync = vi.fn();
    (
      provider as unknown as {
        client: { transactionsSync: typeof transactionsSync };
      }
    ).client.transactionsSync = transactionsSync;

    await expect(
      provider.syncTransactions({
        accessToken: 'access-token',
        providerBankAccountId: '',
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'PLAID_UNKNOWN_ERROR',
        message: 'Plaid transaction sync requires an account ID',
      }),
    );
    expect(transactionsSync).not.toHaveBeenCalled();
  });
});

describe('MonoProvider transaction sync', () => {
  it('fails closed when the requested account does not match its token', async () => {
    const provider = new MonoProvider();

    await expect(
      provider.syncTransactions({
        accessToken: 'mono-account-1',
        providerBankAccountId: 'mono-account-2',
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
