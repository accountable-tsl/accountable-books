import type { ApiResponse } from '../../core/types/api.types.js';
import { providerRegistry } from './providers/registry.js';
import { errorResponse, successResponse } from '../../shared/utils/response.utils.js';
import { createCompanyBankCredential } from '../../domains/banking/banking.model.js';
import {
  connectAccountsService,
  type ConnectAccountsParams,
  type ConnectAccountsResponse,
} from './services/connectAccounts.service.js';
import type { BankProviderKey } from 'src/domains/bankFeedProviders/bankFeedProviders.types.js';

export interface LinkTokenResponse {
  token?: string;
}

export interface ExchangeTokenResponse {
  accessToken?: string;
  itemId?: string;
  error?: {
    code: string;
    displayMessage: string;
    retryable: boolean;
  };
}

export class BankingService {
  /**
   * NEW: Connect bank accounts - unified endpoint for complete bank connection flow
   * Handles token exchange, credential storage, account fetch, and institution resolution
   */
  async connectBankAccounts(
    params: ConnectAccountsParams,
  ): Promise<ApiResponse<ConnectAccountsResponse>> {
    return await connectAccountsService.connectBankAccounts(params);
  }

  /**
   * Classify a bank account as business or personal
   */
  async classifyBankAccount(params: {
    accountId: string;
    companyId: string;
    userId: string;
    businessOrPersonal: 'business' | 'personal';
  }): Promise<ApiResponse<{ id: string; businessOrPersonal: string }>> {
    try {
      // TODO: Add validation that user can modify this account
      // TODO: Update bank_accounts table with classification

      return successResponse('Account classified successfully', {
        id: params.accountId,
        businessOrPersonal: params.businessOrPersonal,
      });
    } catch (error: any) {
      return errorResponse(error.message || 'Failed to classify account');
    }
  }

  /**
   * Create a link token for a given banking provider.
   * Checks if the provider is supported and creates a link token.
   * This token is required to link a bank account to a user.
   */
  async createLinkToken(params: {
    provider: BankProviderKey;
    userId: string;
    companyId: string;
  }): Promise<ApiResponse<LinkTokenResponse>> {
    try {
      const provider = await providerRegistry.get(params.provider);
      if (!provider) {
        return errorResponse(`Unsupported provider: ${params.provider}`);
      }

      const token = await provider.createLinkToken({
        userId: params.userId,
        companyId: params.companyId,
      });

      return successResponse('Link token created', { token });
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : 'Failed to create link token');
    }
  }

  async exchangeToken(params: {
    provider: BankProviderKey;
    publicToken: string;
    metadata?: any;
    companyId: string;
    userId: string;
  }): Promise<ApiResponse<ExchangeTokenResponse>> {
    try {
      const provider = await providerRegistry.get(params.provider);
      if (!provider) {
        return errorResponse(`Provider ${params.provider} is not supported`, {
          displayMessage: 'This bank connection method is not supported.',
          code: 'UNSUPPORTED_PROVIDER',
          retryable: false,
        });
      }

      const result = await provider.exchangeToken({
        publicToken: params.publicToken,
        metadata: params.metadata,
      });

      if (!result.accessToken) {
        throw new Error('No access token returned from plaid');
      }

      await createCompanyBankCredential({
        userId: params.userId,
        companyId: params.companyId,
        providerKey: provider.key,
        identifier: result.itemId || null,
        token: result.accessToken,
        rawData: result,
      });
      return successResponse('Token exchanged successfully', {});
    } catch (error: any) {
      const provider = await providerRegistry.get(params.provider);
      const providerError = provider?.handleError(error) || {
        code: 'UNKNOWN_ERROR',
        displayMessage: 'An unexpected error occurred. Please try again.',
        retryable: false,
      };

      return errorResponse(providerError.displayMessage, providerError);
    }
  }

  async getSupportedCountries(): Promise<string[]> {
    return await providerRegistry.getSupportedCountries();
  }

  async getProvidersForCountry(countryCode: string) {
    return await providerRegistry.getForCountry(countryCode);
  }
}

// Export singleton instance
export const bankingService = new BankingService();
