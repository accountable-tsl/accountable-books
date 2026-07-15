import { randomUUID } from 'crypto';
import type {
  ConnectAccountsResponse,
  ConnectedAccount,
} from '@accountable-books/contracts/schema';
import type { Knex } from 'knex';
import { startOfDay, subDays } from 'date-fns';

import { knexClient } from '../../../db/knexClient.js';
import { createBankAccountFeed } from '../../../domains/banking/bank-account-feeds/bank-account-feeds.model.js';
import { createBankConnectionSecret } from '../../../domains/banking/bank-connection-secrets/bank-connection-secrets.model.js';
import { createBankConnection } from '../../../domains/banking/bank-connections/bank-connections.model.js';
import { createBankAccountWithConnection } from '../../../domains/banking/bankAccounts/bankAccounts.model.js';
import { logger } from '../../../shared/utils/logger.js';
import {
  errorResponse,
  successResponse,
} from '../../../shared/utils/response.utils.js';
import { scheduleTransactionSync } from '../jobs/transaction-sync.queue.js';
import { providerRegistry } from '../providers/registry.js';
import { sanitizeProviderSnapshot } from '../utils/provider-snapshot.js';

import type { ApiResponse } from '../../../core/types/api.types.js';
import type { BankProviderKey } from '../../../domains/banking/bankFeedProviders/bankFeedProviders.types.js';
import type { ProviderAccount } from '../types/base.js';

export interface ConnectAccountsParams {
  providerKey: BankProviderKey;
  countryCode: string;
  publicToken: string;
  metadata?: Record<string, unknown>;
  companyId: string;
  userId: string;
}

export type { ConnectAccountsResponse };

export class ConnectAccountsService {
  async connectBankAccounts(
    params: ConnectAccountsParams,
  ): Promise<ApiResponse<ConnectAccountsResponse>> {
    const traceId = randomUUID();
    const startTime = Date.now();

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
      log('provider_setup', {});
      const provider = await providerRegistry.get(params.providerKey);
      const providerInfo = await providerRegistry.getEnabledProvider(
        params.providerKey,
      );

      if (!provider || !providerInfo) {
        throw new Error(`Provider ${params.providerKey} not found`);
      }

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

      const response = await knexClient.transaction(async (trx) => {
        log('transaction_start', { accountsCount: providerAccounts.length });

        const bankId = institution.systemInstitutionId;
        const bankLogoUrl = institution.logoUrl ?? null;
        const providerBankName = institution.name;

        const bankProviderMappingId = await resolveBankProviderMappingId({
          trx,
          bankFeedProviderId: providerInfo.id,
          bankId,
          providerInstitutionId: institution.providerInstitutionId,
        });

        log('connection_creation', {});
        const sanitizedConnectionSnapshot = sanitizeProviderSnapshot(
          connection.metadata,
          'connection',
        );
        const connectionResult = await createBankConnection({
          data: {
            company_id: params.companyId,
            provider_id: providerInfo.id,
            provider_item_id: itemId ?? null,
            bank_provider_mapping_id: bankProviderMappingId,
            authorization_status: 'active',
            connected_by_id: params.userId,
            provider_snapshot: sanitizedConnectionSnapshot,
            provider_snapshot_version: sanitizedConnectionSnapshot ? 1 : null,
            provider_snapshot_captured_at: sanitizedConnectionSnapshot
              ? new Date()
              : null,
          },
          trx,
        });
        if (!connectionResult.success || !connectionResult.data?.id) {
          throw new Error(
            connectionResult.message || 'Failed to save bank connection',
          );
        }
        const connectionId = connectionResult.data.id;
        log('connection_created', { connectionId });

        log('secret_creation', {});
        const secretResult = await createBankConnectionSecret({
          connectionId,
          companyId: params.companyId,
          accessToken,
          trx,
        });
        if (!secretResult.success) {
          throw new Error(
            secretResult.message || 'Failed to save bank connection secret',
          );
        }
        log('secret_created', { connectionId });

        const createdAccounts: ConnectedAccount[] = [];
        let newCount = 0;
        let updatedCount = 0;

        for (const [index, account] of providerAccounts.entries()) {
          if (!account.accountNumber?.trim()) {
            throw new Error(
              `Provider did not return an account number for ${account.displayName}; confirmation is required before this account can be connected`,
            );
          }
          log('creating_account', {
            index: index + 1,
            total: providerAccounts.length,
            accountId: account.accountId,
            displayName: account.displayName,
          });

          const { bankAccountId, wasUpdated } = await createConnectedAccount({
            trx,
            userId: params.userId,
            companyId: params.companyId,
            bankId,
            providerName: providerInfo.name,
            account,
          });

          const feedResult = await createBankAccountFeed({
            data: {
              company_id: params.companyId,
              bank_account_id: bankAccountId,
              bank_connection_id: connectionId,
              provider_account_id: account.accountId,
              sync_from_date: startOfDay(
                subDays(new Date(), provider.initialTransactionHistoryDays),
              ),
              provider_snapshot: sanitizeProviderSnapshot(
                account.rawData,
                'account',
              ),
              provider_snapshot_version: account.rawData ? 1 : null,
              provider_snapshot_captured_at: account.rawData
                ? new Date()
                : null,
              connected_by_id: params.userId,
            },
            trx,
          });
          if (!feedResult.success || !feedResult.data?.id) {
            throw new Error(
              `Failed to create feed for account ${account.displayName}: ${feedResult.message}`,
            );
          }

          createdAccounts.push({
            id: bankAccountId,
            feedId: feedResult.data.id,
            displayName: account.displayName ?? account.officialName,
            mask: account.mask || account.accountNumber?.slice(-4) || '****',
            currencyCode: account.currencyCode,
            businessOrPersonal: 'business',
          });

          if (wasUpdated) {
            updatedCount++;
          } else {
            newCount++;
          }
        }

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

        return successResponse(message, {
          bank: {
            id: bankId,
            name: providerBankName ?? institution.name,
            logoUrl: bankLogoUrl,
          },
          accounts: createdAccounts,
        });
      });

      // Queue after commit so jobs never race an uncommitted connection.
      if (
        response.success &&
        response.data &&
        provider.supportsTransactionSync()
      ) {
        try {
          await Promise.all(
            response.data.accounts.map((account) =>
              scheduleTransactionSync(
                {
                  bankAccountId: account.id,
                  trigger: 'initial',
                  actorUserId: params.userId,
                },
                { delay: 5000 },
              ),
            ),
          );
          log('sync_queued', {
            bankAccountIds: response.data.accounts.map((account) => account.id),
            syncType: 'initial',
            queueDelay: 5000,
          });
        } catch (error) {
          // Account connection is already committed; a queue outage must not
          // misreport it as a failed connection.
          log('sync_queue_failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            errorName: error instanceof Error ? error.name : 'UnknownError',
            providerKey: params.providerKey,
          });
        }
      }

      return response;
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

async function resolveBankProviderMappingId(input: {
  trx: Knex.Transaction;
  bankFeedProviderId: string;
  bankId: string;
  providerInstitutionId: string;
}): Promise<string | null> {
  try {
    const mapping = await input
      .trx('bank_provider_mappings')
      .where({
        bank_feed_provider_id: input.bankFeedProviderId,
        bank_id: input.bankId,
        provider_institution_id: input.providerInstitutionId,
        is_deleted: false,
      })
      .first<{ id: string }>('id');
    return mapping?.id ?? null;
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      'Failed to resolve bank provider mapping id; continuing without it',
    );
    return null;
  }
}

async function createConnectedAccount(input: {
  trx: Knex.Transaction;
  userId: string;
  companyId: string;
  bankId: string;
  providerName: string;
  account: ProviderAccount;
}): Promise<{ bankAccountId: string; wasUpdated: boolean }> {
  const { account } = input;
  const result = await createBankAccountWithConnection({
    userId: input.userId,
    companyId: input.companyId,
    params: {
      displayName: account.displayName,
      officialName: account.officialName ?? account.displayName,
      accountNumber: account.accountNumber,
      accountNumberMask: account.mask,
      accountType: account.type,
      currencyCode: account.currencyCode,
      bankId: input.bankId,
      businessOrPersonal: 'business', // Default to business
      openingBalance: {
        date: account.balanceDate,
        amount: account.balance,
        origin: 'system_snapshot',
        metadata: {
          capture_channel: 'connection',
          capture_initiator: 'system',
          note: `Account connected from ${input.providerName}. Opening balance was gotten from the connection.`,
        },
      },
    },
    trx: input.trx,
  });

  if (!result.success || !result.data) {
    throw new Error(
      `Failed to create account ${account.displayName}: ${result.message}`,
    );
  }
  return {
    bankAccountId: result.data.bankAccountId,
    wasUpdated: result.data.wasUpdated,
  };
}

// Export singleton
export const connectAccountsService = new ConnectAccountsService();
