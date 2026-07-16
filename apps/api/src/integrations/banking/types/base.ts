import type { BankAccountType } from '../../../domains/banking/bankAccounts/bankAccounts.types.js';
import type { BankProviderKey } from '../../../domains/banking/bankFeedProviders/bankFeedProviders.types.js';

export interface ProviderError {
  code: string;
  message: string;
  displayMessage: string;
  retryable: boolean;
}

/**
 * Where the provider stands on preparing the full requested transaction
 * history for a connection.
 *
 * - collecting: more history is still being prepared; sync again later.
 * - complete: everything the provider will ever supply has been returned.
 * - unavailable: this provider cannot supply historical transactions.
 *
 * Failures are thrown, not reported through this status.
 */
export type ProviderHistoryStatus = 'collecting' | 'complete' | 'unavailable';

// Flexible base interfaces that work across providers
export interface ProviderItemDetails {
  /** Provider's unique identifier for the connection/item */
  itemId: string;
  /** Provider's institution identifier */
  institutionId: string;
  /** Institution name if available */
  institutionName?: string;
  /** Raw provider response for debugging/future use */
  rawData: Record<string, any>;
}
export interface ProviderInstitution {
  providerInstitutionId: string; // Provider's institution identifier
  // systemInstitutionId: string; // Bank's unique identifier in our database
  name: string;
  countryCode: string;
  // key: string; // (country code+institution) name in lowercase e.g us_wells_fargo
  website?: string;
  logoUrl?: string | null;
  bankCodes?: {
    routing?: string;
    swift?: string;
    local?: string; // NIP code, sort code, etc.
  };

  /** Raw provider response */
  rawData: Record<string, any>;
}

export interface ProviderAccount {
  // institutionId: string; // Provider's institution identifier
  accountId: string; // Provider's unique account identifier

  displayName: string;
  officialName?: string;
  accountNumber: string;
  currencyCode: string; // Account ISO currency code (e.g. USD, EUR, GBP, NGN)
  type?: BankAccountType; // Provider's account type
  mask?: string;
  rawData: Record<string, any>;

  balance: number;
  balanceDate: Date;
  /**
   * Provider-reported current balance at connect time. Not an accounting
   * anchor — only stored as the statement/native balance snapshot.
   */
  reportedCurrentBalance?: { amount: number; asOf: Date };
}

export interface AccountDiscoveryResult {
  /** Item/connection details */
  item: ProviderItemDetails;
  /** Institution information */
  institution: ProviderInstitution;
  /** List of discovered accounts */
  accounts: ProviderAccount[];
}

// Legacy interface for backward compatibility
export interface BankAccount {
  id: string;
  name: string;
  accountNumber: string;
  accountType: 'checking' | 'savings' | 'credit' | 'investment';
  currency: string;
  balance?: number;
  institution: {
    id: string;
    name: string;
    code?: string;
  };
}

// Transaction sync interfaces
export interface ProviderTransaction {
  transactionId: string;
  providerBankAccountId: string; // Provider's account ID
  date: string; // ISO date string
  txnAt?: Date | null;
  amount: number;
  merchantName?: string;
  description?: string;
  currencyCode: string;
  pending: boolean;
  category?: string[];
  additionalNotes?: string;
  rawData: Record<string, any>;
}

export interface ConnectionDetails {
  connection: {
    id: string;
    metadata?: Record<string, any>;
  };

  institution: ProviderInstitution & {
    systemInstitutionId: string;
  };
  bankAccounts: ProviderAccount[];
}

/**
 * The complete update an adapter fetched for one account. Adapters own their
 * pagination entirely (cursor loops, page numbers, restart-on-mutation);
 * shared code never branches on provider strategy. Providers also never
 * classify added-vs-modified — they report what they observed, and shared
 * code classifies each observation against what is already stored.
 */
export interface ProviderTransactionUpdate {
  observedTransactions: ProviderTransaction[];
  removedTransactionIds: string[];
  /**
   * Opaque provider checkpoint. Shared code stores it verbatim
   * (bank_account_feeds.sync_cursor) and passes it back on the next fetch;
   * it never interprets the value. Null when the provider has no checkpoint
   * concept (e.g. Mono) or nothing to resume from yet.
   */
  nextCheckpoint: string | null;
  historyStatus: ProviderHistoryStatus;
  pageCount: number;
  approximatePayloadBytes: number;
}

export interface FetchTransactionUpdateInput {
  accessToken: string;
  providerBankAccountId: string;
  /** The checkpoint stored after the last successful sync, verbatim. */
  checkpoint: string | null;
  lastSuccessfulSyncAt: Date | null;
  isInitialSync: boolean;
}

export abstract class BankingProvider {
  abstract readonly key: BankProviderKey;
  abstract readonly name: string;
  /** Provider-configured history expected from a new connection. */
  abstract readonly initialTransactionHistoryDays: number;

  // Initialize a link session and get a temporary token
  abstract createLinkToken({
    userId,
    companyId,
  }: {
    userId: string;
    companyId: string;
  }): Promise<string>;

  // Exchange public token for a long-lived access token
  abstract exchangeToken({
    publicToken,
    metadata,
  }: {
    publicToken: string;
    metadata?: any;
  }): Promise<{
    accessToken: string;
    itemId?: string;
  }>;

  // // Retrieve Bank Accounts from the provider
  // abstract fetchBankAccounts(params: {
  //   accessToken: string;
  //   options?: Record<string, any>;
  // }): Promise<ProviderAccount[]>;

  // Get connection details
  abstract getConnectionDetails(params: {
    accessToken: string;
    countryCode: string;
    userId: string;
  }): Promise<ConnectionDetails>;

  // Transaction sync support
  abstract supportsTransactionSync(): boolean;

  /**
   * Fetch the complete transaction update for one account. The adapter
   * handles every provider-specific pagination detail internally and returns
   * only once the full update is buffered (or throws).
   */
  abstract fetchTransactionUpdate(
    input: FetchTransactionUpdateInput,
  ): Promise<ProviderTransactionUpdate>;

  // Error handling
  abstract handleError(error: any): ProviderError;

  // Helper method for providers that need separate calls for institution and accounts
}
