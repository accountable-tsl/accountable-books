import type {
  AuthGetResponse,
  LinkTokenCreateRequest,
  Transaction as PlaidTransaction,
  TransactionsSyncRequest,
} from 'plaid';
import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
  TransactionsUpdateStatus,
} from 'plaid';

import { ENV } from '../../../config/env.js';
import { logger } from '../../../shared/utils/logger.js';
import { BankingProvider } from '../types/base.js';
import { mapPlaidAccountType } from '../utils/mappings.js';
import { findOrCreateBankMapping } from '../utils/resolveBank.js';
import { TransactionUpdateBuffer } from './provider-sync.utils.js';

import type {
  ConnectionDetails,
  FetchTransactionUpdateInput,
  ProviderAccount,
  ProviderError,
  ProviderHistoryStatus,
  ProviderInstitution,
  ProviderTransaction,
  ProviderTransactionUpdate,
} from '../types/base.js';

const PLAID_PAGINATION_MUTATION =
  'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION';
const MAX_PAGINATION_ATTEMPTS = 3;

function isPaginationMutationError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === PLAID_PAGINATION_MUTATION
  );
}

export class PlaidProvider extends BankingProvider {
  readonly key = 'plaid';
  readonly name = 'Plaid';
  readonly initialTransactionHistoryDays = 730;

  private client: PlaidApi;

  constructor() {
    super();

    const configuration = new Configuration({
      basePath: PlaidEnvironments[ENV.PLAID_ENV!],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': ENV.PLAID_CLIENT_ID,
          'PLAID-SECRET': ENV.PLAID_SECRET,
          'Plaid-Version': ENV.PLAID_VERSION || '2020-09-14',
        },
      },
    });

    this.client = new PlaidApi(configuration);
  }

  async createLinkToken({
    userId,
    companyId,
  }: {
    userId: string;
    companyId: string;
  }): Promise<string> {
    try {
      // get actual country code as retrieved from api, fallback to ENV or maybe env is simpler
      const countries = (ENV.PLAID_COUNTRY_CODES || 'US,CA').split(
        ',',
      ) as CountryCode[];
      const products = (ENV.PLAID_PRODUCTS || 'auth,transactions').split(
        ',',
      ) as Products[];
      const clientName = ENV.FEED_DISPLAY_NAME || 'Accountable';

      const config: LinkTokenCreateRequest = {
        user: { client_user_id: userId },
        client_name: clientName,
        country_codes: countries,
        language: 'en',
        products: products,
        webhook: `${ENV.BACKEND_URL}/webhooks/banking/plaid`,
        // Configure transaction sync settings
        transactions: {
          days_requested: 730,
        },
      };

      if (ENV.PLAID_REDIRECT_URI) {
        config.redirect_uri = ENV.PLAID_REDIRECT_URI;
      }

      const response = await this.client.linkTokenCreate(config);
      return response.data.link_token;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async exchangeToken({
    publicToken,
  }: {
    publicToken: string;
  }): Promise<{ accessToken: string; itemId?: string }> {
    try {
      const response = await this.client.itemPublicTokenExchange({
        public_token: publicToken,
      });

      return {
        accessToken: response.data.access_token,
        itemId: response.data.item_id,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private async fetchBankAccounts({
    accessToken,
  }: {
    accessToken: string;
  }): Promise<ProviderAccount[]> {
    try {
      const res = await this.client.authGet({ access_token: accessToken });
      const accountData = res.data;
      const timestamp = new Date();
      return this.mapAuthGetResponse(accountData, timestamp);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Get institution by id from plaid
  private async getInstitutionById({
    institutionId,
    countryCode,
  }: {
    institutionId: string;
    countryCode: string;
  }): Promise<ProviderInstitution> {
    try {
      // Map string country codes to Plaid's CountryCode enum
      const plaidCountryCodes = (countryCode: string) => {
        switch (countryCode.toUpperCase()) {
          case 'US':
            return CountryCode.Us;
          case 'CA':
            return CountryCode.Ca;
          case 'GB':
            return CountryCode.Gb;
          case 'IE':
            return CountryCode.Ie;
          case 'FR':
            return CountryCode.Fr;
          case 'ES':
            return CountryCode.Es;
          case 'NL':
            return CountryCode.Nl;
          case 'DE':
            return CountryCode.De;
          default:
            return CountryCode.Us;
        }
      };
      const country = plaidCountryCodes(countryCode);

      const response = await this.client.institutionsGetById({
        institution_id: institutionId,
        country_codes: [country],
      });

      const i = response.data.institution;
      return {
        providerInstitutionId: i.institution_id,
        name: i.name,
        // key: `${country}_${i.name}`.toLowerCase(),
        ...(i.url && { website: i.url }),
        ...(i.logo && { logoUrl: i.logo }),
        countryCode: country,
        bankCodes: {
          ...(i.routing_numbers[0] ? { routing: i.routing_numbers[0] } : {}),
          ...(i.routing_numbers[1] ? { local: i.routing_numbers[1] } : {}),
        },
        rawData: i,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Get item details (institution info) for a connected Plaid item
  private async getItemDetails({
    accessToken,
  }: {
    accessToken: string;
  }): Promise<{
    itemId: string;
    institutionId: string;
    institutionName?: string;
    metadata?: Record<string, any>;
  }> {
    try {
      const response = await this.client.itemGet({ access_token: accessToken });
      const item = response.data.item;

      return {
        itemId: item.item_id,
        institutionId: item.institution_id!,
        institutionName: item.institution_name || undefined,
        metadata: {
          availableProducts: item.available_products,
          billedProducts: item.billed_products,
          consentExpirationTime: item.consent_expiration_time,
          updateType: item.update_type,
          rawData: item,
        },
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getConnectionDetails({
    accessToken,
    countryCode,
    userId,
  }: {
    accessToken: string;
    countryCode: string;
    userId: string;
  }): Promise<ConnectionDetails> {
    const item = await this.getItemDetails({ accessToken });
    const providerInstitutionId = item.institutionId;
    const institutionName = item.institutionName;

    const i = await this.getInstitutionById({
      institutionId: item.institutionId,
      countryCode,
    });

    const bankAccounts = await this.fetchBankAccounts({ accessToken });

    const { bankId, bankLogoUrl, providerInstitutionName } =
      await findOrCreateBankMapping({
        providerKey: this.key,
        institution: i,
        userId,
      });

    return {
      connection: {
        id: item.itemId,
        metadata: item,
      },
      institution: {
        ...i,
        name: institutionName || providerInstitutionName || i.name,
        logoUrl: bankLogoUrl,
        systemInstitutionId: bankId,
        providerInstitutionId,
      },
      bankAccounts,
    };
  }

  private mapAuthGetResponse(
    data: AuthGetResponse,
    timestamp: Date,
  ): ProviderAccount[] {
    const accountNumberLookup = new Map();

    for (const [numberType, accounts] of Object.entries(data.numbers)) {
      for (const account of accounts) {
        accountNumberLookup.set(account.account_id, {
          numberType,
          ...account,
        });
      }
    }

    return data.accounts
      .filter((account) => account.name && account.balances.iso_currency_code)
      .map((account) => {
        const numberData = accountNumberLookup.get(account.account_id);
        const currency =
          account.balances.iso_currency_code ||
          account.balances.unofficial_currency_code;
        const type = mapPlaidAccountType({
          type: account.type,
          subtype: account.subtype || undefined,
        });
        const current = account.balances.current;
        return {
          accountId: account.account_id,
          displayName: account.name,
          officialName: account.official_name || account.name,
          accountNumber: numberData?.account || numberData?.iban,
          type,
          mask: account.mask || undefined,
          currencyCode: currency!,
          rawData: {
            account,
            numberData,
            balances: account.balances,
          },
          balance: typeof current === 'number' ? current : 0,
          balanceDate: new Date(timestamp),
          reportedCurrentBalance:
            typeof current === 'number'
              ? { amount: current, asOf: new Date(timestamp) }
              : undefined,
        };
      });
  }

  // Transaction sync support
  supportsTransactionSync(): boolean {
    return true;
  }

  async fetchTransactionUpdate(
    input: FetchTransactionUpdateInput,
  ): Promise<ProviderTransactionUpdate> {
    if (!input.providerBankAccountId) {
      throw this.handleError(
        new Error('Plaid transaction sync requires an account ID'),
      );
    }

    // Plaid may mutate the transaction stream while we paginate; when it
    // does, the whole update must restart from the original checkpoint.
    for (let attempt = 1; attempt <= MAX_PAGINATION_ATTEMPTS; attempt++) {
      try {
        return await this.fetchAllTransactionPages(input);
      } catch (error) {
        if (
          !isPaginationMutationError(error) ||
          attempt === MAX_PAGINATION_ATTEMPTS
        ) {
          throw error;
        }
        logger.warn(
          {
            providerKey: this.key,
            providerBankAccountId: input.providerBankAccountId,
            attempt,
          },
          'Transaction stream changed during pagination; restarting from original checkpoint',
        );
      }
    }
    throw new Error('Transaction pagination attempts exhausted');
  }

  private async fetchAllTransactionPages(
    input: FetchTransactionUpdateInput,
  ): Promise<ProviderTransactionUpdate> {
    const buffer = new TransactionUpdateBuffer({
      providerKey: this.key,
      providerBankAccountId: input.providerBankAccountId,
    });
    let cursor = input.checkpoint ?? undefined;
    let historyStatus: ProviderHistoryStatus = 'collecting';

    while (true) {
      const request: TransactionsSyncRequest = {
        access_token: input.accessToken,
        count: 500,
        options: {
          account_id: input.providerBankAccountId,
          include_personal_finance_category: true,
          include_original_description: true,
        },
      };
      if (cursor) {
        request.cursor = cursor;
      }
      // The history window is fixed by days_requested at Link-token time.

      let data;
      try {
        const response = await this.client.transactionsSync(request);
        data = response.data;
      } catch (error) {
        throw this.handleError(error);
      }

      buffer.addPage({
        // Plaid classifies added vs modified, but shared code classifies
        // observations itself — both flatten into one observed stream.
        observedTransactions: this.mapPlaidTransactions([
          ...data.added,
          ...data.modified,
        ]),
        removedTransactionIds: data.removed.map((txn) => txn.transaction_id),
      });
      historyStatus =
        data.transactions_update_status ===
        TransactionsUpdateStatus.HistoricalUpdateComplete
          ? 'complete'
          : 'collecting';

      if (!data.has_more) {
        const nextCheckpoint = data.next_cursor ? data.next_cursor : null;
        const observedTransactions = buffer.observedTransactions;
        const removedTransactionIds = buffer.removedTransactionIds;
        if (
          !nextCheckpoint &&
          (observedTransactions.length > 0 || removedTransactionIds.length > 0)
        ) {
          throw new Error(
            'Plaid returned transaction updates without a checkpoint',
          );
        }
        const accountBalance = data.accounts?.find(
          (account) => account.account_id === input.providerBankAccountId,
        )?.balances?.current;
        const reportedCurrentBalance =
          typeof accountBalance === 'number'
            ? { amount: accountBalance, asOf: new Date() }
            : undefined;
        return {
          observedTransactions,
          removedTransactionIds,
          nextCheckpoint,
          historyStatus,
          pageCount: buffer.pageCount,
          approximatePayloadBytes: buffer.approximatePayloadBytes,
          ...(reportedCurrentBalance ? { reportedCurrentBalance } : {}),
        };
      }
      if (!data.next_cursor) {
        throw new Error(
          'Plaid reported more transaction pages without a cursor',
        );
      }
      cursor = data.next_cursor;
    }
  }

  private mapPlaidTransactions(
    transactions: PlaidTransaction[],
  ): ProviderTransaction[] {
    return transactions.map((txn) => ({
      transactionId: txn.transaction_id,
      providerBankAccountId: txn.account_id,
      date: txn.date,
      txnAt:
        txn.datetime || txn.date ? new Date(txn.datetime || txn.date) : null,
      merchantName: txn.merchant_name || undefined,
      description: txn.original_description ?? '',
      // According to plaid, for transactions:
      // -- Positive values when money moves out of the account;
      // -- Negative values when money moves in
      // For us, bank_transactions is a mirror of user's bank statements
      // -- So +VE when money moves in; -VE when money moves out
      amount: txn.amount * -1, // Critical!
      currencyCode: (txn.iso_currency_code ||
        txn.unofficial_currency_code) as string,
      pending: txn.pending,
      category: txn.personal_finance_category
        ? [
            txn.personal_finance_category.primary,
            txn.personal_finance_category.detailed,
          ].filter(Boolean)
        : [],
      additionalNotes:
        (txn.merchant_name ?? '') +
        txn.payment_channel +
        txn.personal_finance_category?.detailed +
        (txn.location?.address ?? '') +
        (txn.location?.city ?? '') +
        (txn.location?.region ?? '') +
        (txn.location?.postal_code ?? '') +
        (txn.location?.country ?? '') +
        (txn.location.country ? `country: ${txn.location.country}` : ''),
      rawData: txn,
    }));
  }

  handleError(error: any): ProviderError {
    const plaidError =
      error && typeof error === 'object'
        ? 'error_code' in error
          ? error
          : error.response?.data
        : null;

    if (
      plaidError &&
      typeof plaidError === 'object' &&
      'error_code' in plaidError
    ) {
      return {
        code: plaidError.error_code,
        message: plaidError.error_message,
        displayMessage: this.getDisplayMessage(plaidError.error_code),
        retryable: this.isRetryableError(plaidError.error_code),
      };
    }

    // TODO: Add notification later
    return {
      code: 'PLAID_UNKNOWN_ERROR',
      message: error.message || 'Unknown Plaid error',
      displayMessage: 'An unexpected error occurred. Please try again.',
      retryable: false,
    };
  }

  private isRetryableError(errorCode: string): boolean {
    const retryableCodes = [
      'RATE_LIMIT_EXCEEDED',
      'INTERNAL_SERVER_ERROR',
      'PLANNED_MAINTENANCE',
      'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION',
    ];
    return retryableCodes.includes(errorCode);
  }

  private getDisplayMessage(errorCode: string): string {
    const messages: Record<string, string> = {
      RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again later.',
      INVALID_CREDENTIALS:
        'Invalid login credentials. Please check and try again.',
      ITEM_LOGIN_REQUIRED: 'Please reconnect your bank account.',
      INSUFFICIENT_CREDENTIALS: 'Additional verification required.',
      ITEM_LOCKED:
        'Your account is temporarily locked. Please try again later.',
      USER_SETUP_REQUIRED: 'Please complete account setup with your bank.',
      MFA_NOT_SUPPORTED:
        'Multi-factor authentication not supported for this account.',
    };

    return (
      messages[errorCode] ||
      'An error occurred while connecting to your bank. Please try again.'
    );
  }
}
