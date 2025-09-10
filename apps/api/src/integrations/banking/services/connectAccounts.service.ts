import type { ApiResponse } from '../../../core/types/api.types.js';
import { errorResponse, successResponse } from '../../../shared/utils/response.utils.js';
import { logger, logError } from '../../../shared/utils/logger.js';
import { providerRegistry } from '../providers/registry.js';
import { findOrCreateBankMapping } from '../utils/resolveBank.js';
import { createBankAccountWithConnection } from '../../../domains/banking/bankAccounts/bankAccounts.model.js';
import type { BankProviderKey } from '../../../domains/banking/bankFeedProviders/bankFeedProviders.types.js';
import { randomUUID } from 'crypto';
import { createBankAccountCredential } from '../../../domains/banking/bankAccountCredentials/bankAccountCredentials.model.js';
import { knexClient } from '../../../db/knexClient.js';
import type { BusinessOrPersonalAccount } from '../../../domains/banking/bankAccounts/bankAccounts.types.js';

export interface ConnectAccountsParams {
  providerKey: BankProviderKey;
  publicToken: string;
  metadata?: Record<string, unknown>;
  companyId: string;
  userId: string;
}

export interface ConnectedAccount {
  id: string;
  displayName: string;
  mask: string;
  currencyCode: string;
  businessOrPersonal: BusinessOrPersonalAccount;
}

interface ConnectedBank {
  id: string;
  name: string;
  logoUrl: string | null;
}

export interface ConnectAccountsResponse {
  bank: ConnectedBank;
  accounts: ConnectedAccount[];
}

export class ConnectAccountsService {
  /**
   * Main orchestration method - handles complete bank account connection flow
   * All database operations are wrapped in a single transaction for atomicity
   */
  async connectBankAccounts(params: ConnectAccountsParams): Promise<
    ApiResponse<{
      bank: { id: string; name: string; logoUrl: string | null };
      accounts: ConnectedAccount[];
    }>
  > {
    const traceId = randomUUID();
    const startTime = Date.now();

    // Upfront input validation for fast 400 responses
    if (!params.providerKey) {
      return errorResponse('Missing required field: providerKey', null, { metadata: { traceId } });
    }
    if (!params.publicToken) {
      return errorResponse('Missing required field: publicToken', null, { metadata: { traceId } });
    }
    if (!params.companyId) {
      return errorResponse('Missing required field: companyId', null, { metadata: { traceId } });
    }
    if (!params.userId) {
      return errorResponse('Missing required field: userId', null, { metadata: { traceId } });
    }

    const log = (phase: string, data: Record<string, unknown>) => {
      logger.info(
        {
          traceId,
          companyId: params.companyId,
          providerKey: params.providerKey,
          phase,
          duration_ms: Date.now() - startTime,
          ...data,
        },
        `[${traceId}] ${phase}`,
      );
    };

    log('flow_start', { operation: 'connectBankAccounts' });

    try {
      // External API calls (outside transaction)
      log('provider_setup', {});
      const provider = await providerRegistry.get(params.providerKey);
      const providerInfo = await providerRegistry.getEnabledProvider(params.providerKey);

      if (!provider || !providerInfo) {
        throw new Error(`Provider ${params.providerKey} not found`);
      }

      const providerCountryCodes = providerInfo.countries.map((c) => c.code);

      log('token_exchange', {});
      const { accessToken, itemId } = await provider.exchangeToken({
        publicToken: params.publicToken,
      });

      log('item_details', {});
      const {
        institutionId,
        metadata: itemMetadata,
        institutionName,
      } = await provider.getItemDetails({
        accessToken,
      });

      log('fetch_accounts', {});
      const providerAccounts = await provider.fetchBankAccounts({
        accessToken,
      });

      log('resolve_institution', {});
      const resolvedInstitution = await provider.getInstitutionById({
        institutionId,
        countryCodes: providerCountryCodes,
      });
      const institution = resolvedInstitution[0];

      // ALL DATABASE OPERATIONS IN SINGLE TRANSACTION
      return await knexClient.transaction(async (trx) => {
        log('transaction_start', { accountsCount: providerAccounts.length });

        // 1. Save credentials
        log('credential_creation', {});
        const credentialResult = await createBankAccountCredential({
          userId: params.userId,
          companyId: params.companyId,
          data: {
            providerId: providerInfo.id,
            accessToken: accessToken,
            rawMetadata: { itemId, metadata: itemMetadata },
            status: 'active',
            itemIdentifier: itemId,
            institutionId,
            institutionName,
          },
          trx,
        });

        if (!credentialResult.success || !credentialResult.data?.id) {
          throw new Error(credentialResult.message || 'Failed to save bank credential');
        }
        const credentialId = credentialResult.data.id;
        log('credential_created', { credentialId });

        // 2. Resolve bank mapping
        log('bank_mapping', {});
        const { bankId, bankLogoUrl, providerBankName } = await findOrCreateBankMapping({
          providerKey: params.providerKey,
          institution,
          userId: params.userId,
          trx,
        });
        log('bank_mapping_created', { bankId });

        // 3. Create all bank accounts
        const createdAccounts: ConnectedAccount[] = [];
        let newCount = 0;
        let updatedCount = 0;

        for (const [index, account] of providerAccounts.entries()) {
          log('creating_account', {
            index: index + 1,
            total: providerAccounts.length,
            accountId: account.accountId,
            displayName: account.displayName,
          });

          const result = await createBankAccountWithConnection({
            userId: params.userId,
            companyId: params.companyId,
            params: {
              providerId: providerInfo.id,
              providerBankAccountId: account.accountId,
              connectionCredentialId: credentialId,
              connectionStatus: 'connected',
              displayName: account.displayName,
              accountName: account.officialName ?? account.displayName,
              accountNumber: account.accountNumber,
              accountNumberMask: account.mask,
              accountType: account.type,
              currencyCode: account.currencyCode,
              businessOrPersonal: 'business', // Default to business
              bankId,
            },
            trx,
          });

          if (result.success && result.data) {
            const { bankAccountId, wasUpdated } = result.data;
            createdAccounts.push({
              id: bankAccountId,
              displayName: account.displayName ?? account.officialName,
              mask: account.mask || account.accountNumber?.slice(-4) || '****',
              currencyCode: account.currencyCode,
              businessOrPersonal: 'business', // Default to business
            });

            if (wasUpdated) {
              updatedCount++;
            } else {
              newCount++;
            }
          } else {
            throw new Error(`Failed to create account ${account.displayName}: ${result.message}`);
          }
        }

        // Generate simple success message
        const message =
          newCount === 0
            ? `All set! ${updatedCount} existing account${updatedCount > 1 ? 's' : ''} reconnected successfully.`
            : `All set! ${newCount} new account${newCount > 1 ? 's' : ''} connected and ${updatedCount} updated successfully.`;

        log('transaction_complete', {
          totalCreated: newCount,
          totalUpdated: updatedCount,
        });
        return successResponse(message, {
          bank: { id: bankId, name: providerBankName ?? institutionName, logoUrl: bankLogoUrl },
          accounts: createdAccounts,
        });
      });
    } catch (error: unknown) {
      log('transaction_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      logError(error as Error, {
        traceId,
        companyId: params.companyId,
        providerKey: params.providerKey,
        operation: 'connectBankAccounts',
        duration_ms: Date.now() - startTime,
      });

      const message = error instanceof Error ? error.message : 'Failed to connect bank accounts';
      return errorResponse(message, error, { metadata: { traceId } });
    }
  }
}

// Export singleton
export const connectAccountsService = new ConnectAccountsService();
