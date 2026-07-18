import axios from 'axios';
import { startOfDay, startOfMonth, subDays } from 'date-fns';

import { ENV } from '../../../config/env.js';
import { logger } from '../../../shared/utils/logger.js';
import { BankingProvider } from '../types/base.js';
import { mapMonoAccountType } from '../utils/mappings.js';
import { findOrCreateBankMapping } from '../utils/resolveBank.js';
import { TransactionUpdateBuffer } from './provider-sync.utils.js';

import type {
  ConnectionDetails,
  FetchTransactionUpdateInput,
  ProviderAccount,
  ProviderError,
  ProviderTransaction,
  ProviderTransactionUpdate,
} from '../types/base.js';
import type { FindOrCreateBankMappingResponse } from '../utils/resolveBank.js';

export class MonoProvider extends BankingProvider {
  readonly key = 'mono';
  readonly name = 'Mono';
  readonly initialTransactionHistoryDays = 730;

  private readonly secretKey = ENV.MONO_SECRET_KEY || '';
  private readonly baseUrl = 'https://api.withmono.com/v2';

  async createLinkToken({
    userId,
    companyId,
  }: {
    userId: string;
    companyId: string;
    accessToken?: string;
  }): Promise<string> {
    // Mono uses a widget-based approach with public key on frontend
    // We only return metadata for tracking - no secret key!
    return JSON.stringify({
      userId,
      companyId,
      // Frontend will use VITE_MONO_PUBLIC_KEY environment variable
    });
  }

  async exchangeToken({
    publicToken,
  }: {
    publicToken: string;
  }): Promise<{ accessToken: string; itemId?: string }> {
    try {
      // Mono uses 'code' parameter, not 'publicToken'
      const response = await axios.post(
        `${this.baseUrl}/accounts/auth`,
        { code: publicToken }, // Changed from { publicToken }
        {
          headers: {
            'mono-sec-key': this.secretKey,
            'Content-Type': 'application/json',
          },
        },
      );

      if (response.data.status !== 'successful') {
        throw new Error(`Mono exchange failed: ${response.data.message}`);
      }

      // Mono returns the account ID which serves as both access token and item ID
      const accountId = response.data.data.id;
      return {
        accessToken: accountId,
        itemId: accountId,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getConnectionDetails({
    accessToken,
    countryCode,
    options,
    userId,
  }: {
    accessToken: string;
    options?: Record<string, any>;
    countryCode: string;
    userId: string;
  }): Promise<ConnectionDetails> {
    try {
      // For Mono, the access token is the account ID
      const response = await axios.get(
        `${this.baseUrl}/accounts/${accessToken}`,
        {
          headers: {
            'mono-sec-key': this.secretKey,
            'Content-Type': 'application/json',
          },
        },
      );

      if (response.data.status !== 'successful') {
        throw new Error(`Mono account fetch failed: ${response.data.message}`);
      }

      const accountsResponse: {
        account: any;
        customer: any;
        meta: any;
      } = response.data.data;
      const timestamp = response.data.timestamp;
      const accountData = accountsResponse.account;
      const institutionData: {
        name: string;
        bank_code: string;
        type?: string;
      } = accountData.institution;

      // Determine institution ID
      // Check db for this institution, if not found, check mono api and create bank + bank provider mapping , mono api not available, use other financial institutions for the specified country.
      // This way, we can then use institution id directly in connect accounts service. get item details is almost useless for mono, we should find a way to conditionally skip it in connect accounts service in a way that is scalable, efficient, sustainable and extensible.
      const institutionResponse = await axios.get(
        `https://api.withmono.com/v3/institutions?country=${countryCode.toLowerCase()}${institutionData.type ? `&type=${institutionData.type.toLowerCase()}` : ''}`,
        {
          headers: {
            'mono-sec-key': this.secretKey,
            'Content-Type': 'application/json',
          },
        },
      );
      if (institutionResponse.data.status !== 'successful') {
        logger.warn(
          {
            countryCode,
            institutionType: institutionData.type,
            institutionName: institutionData.name,
            bankCode: institutionData.bank_code,
            responseStatus: institutionResponse.data.status,
            responseMessage: institutionResponse.data.message,
          },
          'Mono institutions API call failed - using fallback institution data from account response',
        );
      }
      const matchedInstitution:
        | {
            id: string;
            institution: string; // institution name
            type: string;
            bank_code: string | null;
            nip_code?: string | null;
            country: string;
            auth_methods: any[];
            scope: any[];
          }
        | undefined = institutionResponse.data.data.find(
        (institution: any) =>
          institution.bank_code === institutionData.bank_code ||
          // or where name matches
          institution.institution === institutionData.name,
      );

      let bankResult: FindOrCreateBankMappingResponse;
      if (matchedInstitution) {
        bankResult = await findOrCreateBankMapping({
          providerKey: this.key,
          institution: {
            providerInstitutionId: matchedInstitution.id,
            name: matchedInstitution.institution,
            countryCode: countryCode,
            bankCodes: {
              local: institutionData.bank_code,
            },
            rawData: matchedInstitution,
          },
          userId,
        });
      } else {
        bankResult = await findOrCreateBankMapping({
          providerKey: this.key,
          institution: {
            providerInstitutionId: institutionData.bank_code,
            name: institutionData.name,
            countryCode: countryCode,
            bankCodes: {
              local: institutionData.bank_code,
            },
            rawData: institutionData,
          },
          userId,
        });
      }

      const { bankId } = bankResult;

      const accounts: ProviderAccount[] = [
        {
          accountId: accountData.id || accessToken,
          displayName: accountData.name,
          officialName: accountData.name,
          accountNumber: accountData.account_number,
          currencyCode: accountData.currency,
          type: mapMonoAccountType(accountData.type),
          mask: accountData.account_number?.slice(-4),
          rawData: accountData,
          balance: accountData.balance,
          balanceDate: new Date(timestamp),
          reportedCurrentBalance: {
            amount: accountData.balance,
            asOf: new Date(timestamp),
          },
        },
      ];

      return {
        connection: {
          id: accessToken,
          metadata: {
            ...accountData,
            institution: matchedInstitution || institutionData,
          },
        },
        institution: {
          systemInstitutionId: bankId,
          providerInstitutionId:
            matchedInstitution?.id || institutionData.bank_code,
          name: matchedInstitution?.institution || institutionData.name,
          countryCode: countryCode,
          bankCodes: {
            local: institutionData.bank_code,
          },
          rawData: matchedInstitution || institutionData,
        },
        bankAccounts: accounts,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Transaction sync support
  supportsTransactionSync(): boolean {
    return true; // Enabled!
  }

  async fetchTransactionUpdate(
    input: FetchTransactionUpdateInput,
  ): Promise<ProviderTransactionUpdate> {
    if (input.providerBankAccountId !== input.accessToken) {
      throw this.handleError(
        new Error(
          'Mono provider account does not match the connected account token',
        ),
      );
    }

    // Mono has no stable cursor: refetch an overlapping date range and rely
    // on provider-id dedupe downstream. Page numbers live and die inside
    // this one fetch; nothing is checkpointed.
    const fromDate = this.getFetchWindowStart(input);
    const buffer = new TransactionUpdateBuffer({
      providerKey: this.key,
      providerBankAccountId: input.providerBankAccountId,
    });

    let page = 1;
    while (true) {
      const { transactions, currentPage, totalPages } = await this.fetchPage({
        accessToken: input.accessToken,
        page,
        fromDate,
      });
      buffer.addPage({
        observedTransactions: transactions,
        removedTransactionIds: [], // Mono doesn't track deletions
      });
      if (currentPage >= totalPages) {
        const reportedCurrentBalance = await this.fetchReportedCurrentBalance(
          input.accessToken,
        );
        return {
          observedTransactions: buffer.observedTransactions,
          removedTransactionIds: [],
          nextCheckpoint: null,
          // A completed full fetch is all the history Mono will ever supply.
          historyStatus: 'complete',
          pageCount: buffer.pageCount,
          approximatePayloadBytes: buffer.approximatePayloadBytes,
          ...(reportedCurrentBalance ? { reportedCurrentBalance } : {}),
        };
      }
      page = currentPage + 1;
    }
  }

  private async fetchReportedCurrentBalance(
    accessToken: string,
  ): Promise<{ amount: number; asOf: Date } | undefined> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/accounts/${accessToken}`,
        {
          headers: {
            'mono-sec-key': this.secretKey,
            'Content-Type': 'application/json',
          },
        },
      );
      const balance = response.data?.data?.account?.balance;
      if (typeof balance !== 'number') return undefined;
      return { amount: balance, asOf: new Date() };
    } catch {
      return undefined;
    }
  }

  private getFetchWindowStart(input: FetchTransactionUpdateInput): Date {
    if (input.isInitialSync) {
      return startOfDay(
        subDays(new Date(), this.initialTransactionHistoryDays),
      );
    }
    if (!input.lastSuccessfulSyncAt) return startOfMonth(new Date());
    // One-day overlap to catch backdated transactions.
    return subDays(new Date(input.lastSuccessfulSyncAt), 1);
  }

  private async fetchPage(params: {
    accessToken: string;
    page: number;
    fromDate: Date;
  }): Promise<{
    transactions: ProviderTransaction[];
    currentPage: number;
    totalPages: number;
  }> {
    try {
      // Mono expects DD-MM-YYYY dates
      const queryParams = new URLSearchParams({
        page: params.page.toString(),
        paginate: 'true',
        start: this.formatDateForMono(params.fromDate),
        end: this.formatDateForMono(new Date()),
      });

      const response = await axios.get(
        `${this.baseUrl}/accounts/${params.accessToken}/transactions?${queryParams}`,
        {
          headers: {
            'mono-sec-key': this.secretKey,
            'Content-Type': 'application/json',
          },
        },
      );

      if (response.data.status !== 'successful') {
        throw new Error(
          `Mono transaction sync failed: ${response.data.message}`,
        );
      }

      const data = response.data.data;
      const meta = response.data.meta || {};

      const sortedData = (data || []).sort(
        (a: any, b: any) =>
          new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      const transactions = sortedData.map(
        (txn: any): ProviderTransaction => ({
          transactionId: txn._id,
          providerBankAccountId: params.accessToken,
          date: txn.date,
          txnAt: new Date(txn.date),
          amount: txn.type === 'credit' ? txn.amount : -txn.amount,
          merchantName: txn.narration || undefined,
          description: txn.narration || '',
          // Note: Mono API doesn't return currency per transaction.
          // Currency is not used by TransactionSyncService - it uses bank_accounts.currency_id
          // which was set correctly during connection from accountData.currency (NGN, KES, GHS, etc).
          currencyCode: '',
          pending: false, // Mono doesn't provide pending status
          category: txn.category ? [txn.category] : undefined,
          rawData: txn,
        }),
      );

      return {
        transactions,
        currentPage: meta.page || params.page,
        totalPages: meta.pages || 1,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Format date to DD-MM-YYYY as expected by Mono API
   */
  private formatDateForMono(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }

  handleError(error: any): ProviderError {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;

      return {
        code: `MONO_${status || 'UNKNOWN'}`,
        message: message,
        displayMessage: this.getMonoDisplayMessage(status),
        retryable: this.isRetryableError(status),
      };
    }

    return {
      code: 'MONO_UNKNOWN_ERROR',
      message: error.message || 'Unknown Mono error',
      displayMessage:
        'An error occurred while connecting to your bank. Please try again.',
      retryable: false,
    };
  }

  private isRetryableError(status?: number): boolean {
    return status === 429 || status === 500 || status === 502 || status === 503;
  }

  private getMonoDisplayMessage(status?: number): string {
    const messages: Record<number, string> = {
      400: 'Invalid request. Please check your information and try again.',
      401: 'Authentication failed. Please reconnect your bank account.',
      403: 'Access denied. Please contact support.',
      404: 'Bank account not found. Please reconnect.',
      429: 'Too many requests. Please try again later.',
      500: 'Bank server error. Please try again later.',
      502: 'Bank service unavailable. Please try again later.',
      503: 'Bank service temporarily unavailable. Please try again later.',
    };

    return (
      messages[status || 0] ||
      'An error occurred while connecting to your bank. Please try again.'
    );
  }
}
