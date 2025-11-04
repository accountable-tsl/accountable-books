import type { BankAccountType } from '../../../domains/banking/bankAccounts/bankAccounts.types.js';
import type { BankProviderKey } from '../../../domains/banking/bankFeedProviders/bankFeedProviders.types.js';

export interface ProviderError {
  code: string;
  message: string;
  displayMessage: string;
  retryable: boolean;
}

/**
 * Transaction sync strategies for different provider types
 *
 * CURSOR_BASED: Provider offers stable cursors for incremental sync (Plaid, Teller, Stripe)
 * - Store cursor between syncs
 * - Cursor remains valid across pagination
 * - No date range needed for incremental syncs
 *
 * DATE_RANGE_OVERLAP: Provider uses page-based pagination without stable cursors (Mono, Okra)
 * - Use date ranges for queries
 * - Add 1-day overlap to catch backdated transactions
 * - Don't store page numbers (they're unstable)
 * - Rely on database deduplication via UNIQUE constraint
 */
export enum TransactionSyncStrategy {
  CURSOR_BASED = 'cursor',
  DATE_RANGE_OVERLAP = 'date',
}

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

export interface TransactionSyncResult {
  transactions: {
    added: ProviderTransaction[];
    modified: ProviderTransaction[];
    removed: string[]; // transaction IDs
  };

  nextCursor?: string;
  hasMore: boolean;
}

export abstract class BankingProvider {
  abstract readonly key: BankProviderKey;
  abstract readonly name: string;
  abstract readonly transactionSyncStrategy: TransactionSyncStrategy;

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

  // Sync transactions (initial or incremental)
  abstract syncTransactions(params: {
    accessToken: string;
    cursor?: string;
    fromDate?: Date; // For initial sync only
  }): Promise<TransactionSyncResult>;

  // Error handling
  abstract handleError(error: any): ProviderError;

  // Helper method for providers that need separate calls for institution and accounts
}
