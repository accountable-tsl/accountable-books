export interface ProviderError {
  code: string;
  message: string;
  displayMessage: string;
  retryable: boolean;
}

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

  // Core methods needed for MVP
  abstract createLinkToken({
    userId,
    companyId,
  }: {
    userId: string;
    companyId: string;
  }): Promise<string>;
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

  // Error handling
  abstract handleError(error: any): ProviderError;
}
