import type { BankAccountType } from 'src/domains/banking/bankAccounts/bankAccounts.types.js';

export interface ProviderError {
  code: string;
  message: string;
  displayMessage: string;
  retryable: boolean;
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
  institutionId: string;
  name: string;
  key: string; // (country code+institution) name in lowercase e.g us_wells_fargo
  website?: string;
  logoUrl?: string | null;
  countryCode: string;
  bankCodes?: {
    routing?: string;
    swift?: string;
    local?: string; // NIP code, sort code, etc.
  };
  /** Raw provider response */
  rawData: Record<string, any>;
}

export interface ProviderAccount {
  accountId: string; // Provider's unique account identifier
  institutionId?: string; // Provider's institution identifier
  displayName: string;
  officialName?: string;
  accountNumber: string;
  currencyCode: string; // Account ISO currency code (e.g. USD, EUR, GBP, NGN)
  type?: BankAccountType; // Provider's account type
  mask?: string;
  rawData: Record<string, any>;
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

export abstract class BankingProvider {
  abstract readonly key: string;
  abstract readonly name: string;

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

  // // Encrypt and save the credentials (access token) securely
  // abstract saveCredentials(params: {
  //   userId: string;
  //   companyId: string;
  //   providerKey: string; // or maybe ID
  //   identifier: string;
  //   rawData: Record<string, any>;
  //   token: string;
  // }): Promise<void>;

  // Retrieve Bank Accounts from the provider
  abstract fetchBankAccounts(params: {
    accessToken: string;
    options?: Record<string, any>;
  }): Promise<ProviderAccount[]>;

  // Get item details (institution ID, metadata) for a connected item
  abstract getItemDetails(params: { accessToken: string }): Promise<{
    itemId: string;
    institutionId: string;
    institutionName?: string;
    metadata?: Record<string, any>;
  }>;

  // Get institution details by ID from the provider
  abstract getInstitutionById(params: {
    institutionId: string;
    countryCodes?: string[];
  }): Promise<ProviderInstitution[]>;

  // Error handling
  abstract handleError(error: any): ProviderError;

  // Helper method for providers that need separate calls for institution and accounts
}
