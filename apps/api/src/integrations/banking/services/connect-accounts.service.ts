import { randomUUID } from 'crypto';

import { knexClient } from '../../../db/knexClient.js';
import { createBankAccountCredential } from '../../../domains/banking/bankAccountCredentials/bankAccountCredentials.model.js';
import { createBankAccountWithConnection } from '../../../domains/banking/bankAccounts/bankAccounts.model.js';
import { logger } from '../../../shared/utils/logger.js';
import {
  errorResponse,
  successResponse,
} from '../../../shared/utils/response.utils.js';
import { transactionSyncQueue } from '../jobs/transaction-sync.queue.js';
import { providerRegistry } from '../providers/registry.js';

import type { ApiResponse } from '../../../core/types/api.types.js';
import type { BusinessOrPersonalAccount } from '../../../domains/banking/bankAccounts/bankAccounts.types.js';
import type { BankProviderKey } from '../../../domains/banking/bankFeedProviders/bankFeedProviders.types.js';

export interface ConnectAccountsParams {
  providerKey: BankProviderKey;
  countryCode: string;
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
      return errorResponse('Missing required field: providerKey', null, {
        metadata: { traceId },
      });
    }
    if (!params.publicToken) {
      return errorResponse('Missing required field: publicToken', null, {
        metadata: { traceId },
      });
    }
    if (!params.companyId) {
      return errorResponse('Missing required field: companyId', null, {
        metadata: { traceId },
      });
    }
    if (!params.userId) {
      return errorResponse('Missing required field: userId', null, {
        metadata: { traceId },
      });
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
      const providerInfo = await providerRegistry.getEnabledProvider(
        params.providerKey,
      );

      if (!provider || !providerInfo) {
        throw new Error(`Provider ${params.providerKey} not found`);
      }

      const providerCountryCodes = providerInfo.countries.map((c) => c.code);

      log('token_exchange', {});
      const { accessToken, itemId } = await provider.exchangeToken({
        publicToken: params.publicToken,
      });

      const {
        connection,
        institution,
        bankAccounts: providerAccounts,
      } = await provider.getConnectionDetails({
        accessToken,
        countryCode: params.countryCode,
        userId: params.userId,
      });

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
            rawMetadata: { itemId, metadata: connection.metadata },
            status: 'active',
            itemIdentifier: itemId ?? null,
            institutionId: institution.providerInstitutionId,
            institutionName: institution.name,
          },
          trx,
        });

        if (!credentialResult.success || !credentialResult.data?.id) {
          throw new Error(
            credentialResult.message || 'Failed to save bank credential',
          );
        }
        const credentialId = credentialResult.data.id;
        log('credential_created', { credentialId });

        // 2. Use pre-resolved bank from provider (already resolved in getConnectionDetails)
        log('using_pre_resolved_bank', {
          bankId: institution.systemInstitutionId,
        });
        const bankId = institution.systemInstitutionId;
        const bankLogoUrl = institution.logoUrl ?? null;
        const providerBankName = institution.name;

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
              accountMetadata: {
                connection_source: 'connection',
                connection_note: `Account connected from ${providerInfo.name}. Opening balance was gotten from the connection.`,
                ...(account.rawData || {}),
              },
              openingBalance: {
                date: account.balanceDate,
                amount: account.balance,
                origin: 'system_snapshot',
                metadata: {
                  capture_channel: 'connection',
                  capture_initiator: 'system',
                  note: `Account connected from ${providerInfo.name}. Opening balance was gotten from the connection.`,
                },
              },
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
            throw new Error(
              `Failed to create account ${account.displayName}: ${result.message}`,
            );
          }
        }

        // Generate simple success message
        const plural = (n: number) => (n > 1 ? 's' : '');
        const message =
          updatedCount === 0
            ? `All set! ${newCount} new account${plural(newCount)} connected successfully.`
            : newCount === 0
              ? `All set! ${updatedCount} existing account${plural(updatedCount)} reconnected successfully.`
              : `All set! ${newCount} new account${plural(newCount)} connected and ${updatedCount} updated successfully.`;

        log('transaction_complete', {
          totalCreated: newCount,
          totalUpdated: updatedCount,
        });

        // Queue initial transaction sync (after DB transaction completes)
        // Only for providers that support transaction sync
        try {
          const provider = await providerRegistry.get(params.providerKey);
          if (provider && provider.supportsTransactionSync()) {
            await transactionSyncQueue.add(
              'sync-transactions',
              {
                credentialId: credentialId,
                syncType: 'initial',
                companyId: params.companyId,
                userId: params.userId,
              },
              {
                delay: 5000, // Wait 5 seconds for Plaid to be ready
                attempts: 3,
                backoff: {
                  type: 'exponential',
                  delay: 2000,
                },
              },
            );
            // Note: Daily sync is handled by a central daily scan job
            // No need to schedule per-credential repeatables
            log('sync_queued', {
              credentialId,
              syncType: 'initial',
              queueDelay: 5000,
              attempts: 3,
              providerSupportsSync: true,
            });
          } else {
            log('sync_skipped', {
              credentialId,
              reason: provider
                ? 'Provider does not support transaction sync'
                : 'Provider not found',
              providerKey: params.providerKey,
              providerSupportsSync:
                provider?.supportsTransactionSync() || false,
            });
          }
        } catch (error) {
          // Don't fail the main flow if sync queueing fails
          log('sync_queue_failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            errorName: error instanceof Error ? error.name : 'UnknownError',
            credentialId,
            providerKey: params.providerKey,
          });
        }

        return successResponse(message, {
          bank: {
            id: bankId,
            name: providerBankName ?? institution.name,
            logoUrl: bankLogoUrl,
          },
          accounts: createdAccounts,
        });
      });
    } catch (error: unknown) {
      log('transaction_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      const message =
        error instanceof Error
          ? error.message
          : 'Failed to connect bank accounts';
      return errorResponse(message, error, { metadata: { traceId } });
    }
  }
}

// Export singleton
export const connectAccountsService = new ConnectAccountsService();
