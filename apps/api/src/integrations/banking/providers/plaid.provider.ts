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
} from 'plaid';

import { ENV } from '../../../config/env.js';
import { BankingProvider, TransactionSyncStrategy } from '../types/base.js';
import { mapPlaidAccountType } from '../utils/mappings.js';
import { findOrCreateBankMapping } from '../utils/resolveBank.js';

import type {
  ConnectionDetails,
  ProviderAccount,
  ProviderError,
  ProviderInstitution,
  ProviderTransaction,
  TransactionSyncResult,
} from '../types/base.js';

export class PlaidProvider extends BankingProvider {
  readonly key = 'plaid';
  readonly name = 'Plaid';
  readonly transactionSyncStrategy = TransactionSyncStrategy.CURSOR_BASED;

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

      console.log('Exchange token response:', response.data);

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
          balance: (account.balances.current ||
            account.balances.available) as number,
          balanceDate: new Date(timestamp),
        };
      });
  }

  // Transaction sync support
  supportsTransactionSync(): boolean {
    return true;
  }

  async syncTransactions(params: {
    accessToken: string;
    cursor?: string;
    fromDate?: Date;
  }): Promise<TransactionSyncResult> {
    try {
      const request: TransactionsSyncRequest = {
        access_token: params.accessToken,
        options: {
          include_personal_finance_category: true,
          include_original_description: true,
        },
      };

      // Add cursor if this is not the initial sync
      if (params.cursor) {
        request.cursor = params.cursor;
      }

      // For initial sync, Plaid will use the days_requested from Link token creation
      // fromDate is handled at Link token creation time

      const response = await this.client.transactionsSync(request);
      const data = response.data;

      const balances = data.accounts.map((account) => ({
        providerBankAccountId: account.account_id,
        closingBalance:
          account.balances.current || account.balances.available || undefined,
      }));

      return {
        transactions: {
          added: this.mapPlaidTransactions(data.added),
          modified: this.mapPlaidTransactions(data.modified),
          removed: data.removed.map((txn) => txn.transaction_id),
        },
        nextCursor: data.next_cursor,
        hasMore: data.has_more,
      };
    } catch (error) {
      throw this.handleError(error);
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
    if (error && typeof error === 'object' && 'error_code' in error) {
      return {
        code: error.error_code,
        message: error.error_message,
        displayMessage: this.getDisplayMessage(error.error_code),
        retryable: this.isRetryableError(error.error_code),
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
