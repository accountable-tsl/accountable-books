import { randomUUID } from 'crypto';
import type {
  ConnectAccountsResponse,
  ConnectedAccount,
} from '@accountable-books/contracts/schema';
import type { Knex } from 'knex';
import { formatInTimeZone } from 'date-fns-tz';

import { knexClient } from '../../../db/knexClient.js';
import { updateProviderReportedBalance } from '../../../domains/balances/bank-current-balance.js';
import { createBankAccountFeed } from '../../../domains/banking/bank-account-feeds/bank-account-feeds.model.js';
import { createBankConnectionSecret } from '../../../domains/banking/bank-connection-secrets/bank-connection-secrets.model.js';
import { createBankConnection } from '../../../domains/banking/bank-connections/bank-connections.model.js';
import {
  createHistoryImport,
  deleteAllHistoryCandidates,
  markHistoryImportStatus,
  refreshHistoryImportAggregates,
} from '../../../domains/banking/bank-transaction-history/bank-transaction-history.model.js';
import {
  resolveHistoryImportAttention,
  writeBankReconnectNotificationLifecycle,
} from '../../../domains/banking/bankAccounts/bankAccountNotifications.js';
import { createBankAccountWithConnection } from '../../../domains/banking/bankAccounts/bankAccounts.model.js';
import { classifyConnectEvent } from '../../../domains/banking/connection-lifecycle/classify.js';
import {
  bumpActiveFeedStateVersions,
  ensureActiveConnectionSecret,
  reactivateConnectionForReauth,
  reactivateFeedForReauth,
  revokeConnectionAndDestroySecret,
} from '../../../domains/banking/connection-lifecycle/lifecycle.commands.js';
import { logger } from '../../../shared/utils/logger.js';
import {
  errorResponse,
  successResponse,
} from '../../../shared/utils/response.utils.js';
import { providerRegistry } from '../providers/registry.js';
import { writeBankSyncOutbox } from '../transaction-sync.outbox.js';
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
  confirmReplacement?: boolean;
}

export type { ConnectAccountsResponse };

export type ConnectAccountsResultData = ConnectAccountsResponse & {
  outcome: 'connected' | 'reauthorized' | 'replaced' | 'needs_confirmation';
  confirmation?: {
    reason: string;
    oldConnectionIds: string[];
    mappings: Array<{
      oldFeedId: string;
      oldConnectionId: string;
      bankAccountId: string;
      providerAccountId: string;
    }>;
  };
};

export class ConnectAccountsService {
  async connectBankAccounts(
    params: ConnectAccountsParams,
  ): Promise<ApiResponse<ConnectAccountsResultData>> {
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

        const classification = await classifyConnectEvent({
          trx,
          companyId: params.companyId,
          providerId: providerInfo.id,
          providerItemId: itemId ?? null,
          providerAccountIds: providerAccounts.map((a) => a.accountId),
        });

        if (classification.kind === 'needs_confirmation') {
          if (!params.confirmReplacement) {
            return successResponse(
              'Confirmation required before replacing connection',
              {
                bank: {
                  id: bankId,
                  name: providerBankName ?? institution.name,
                  logoUrl: bankLogoUrl,
                },
                accounts: [],
                outcome: 'needs_confirmation' as const,
                confirmation: {
                  reason: classification.reason,
                  oldConnectionIds:
                    classification.proposed?.oldConnectionIds ?? [],
                  mappings: classification.proposed?.mappings ?? [],
                },
              },
            );
          }
          // Confirmed ambiguous replace: require a single old connection in the proposal.
          const oldIds = classification.proposed?.oldConnectionIds ?? [];
          if (oldIds.length !== 1 || !classification.proposed) {
            return errorResponse<ConnectAccountsResultData>(
              'Cannot confirm replacement without a single clear old connection',
              null,
            );
          }
          return executeReplaceConnection({
            trx,
            params,
            provider,
            providerInfo,
            accessToken,
            itemId,
            connection,
            institution,
            providerAccounts,
            bankId,
            bankLogoUrl,
            providerBankName,
            bankProviderMappingId,
            oldConnectionId: oldIds[0]!,
            mappings: classification.proposed.mappings,
            log,
          });
        }

        if (classification.kind === 'reauth') {
          return executeReauthorizeConnection({
            trx,
            params,
            provider,
            accessToken,
            connection,
            institution,
            providerAccounts,
            bankId,
            bankLogoUrl,
            providerBankName,
            connectionId: classification.connectionId,
            log,
          });
        }

        if (classification.kind === 'replace') {
          return executeReplaceConnection({
            trx,
            params,
            provider,
            providerInfo,
            accessToken,
            itemId,
            connection,
            institution,
            providerAccounts,
            bankId,
            bankLogoUrl,
            providerBankName,
            bankProviderMappingId,
            oldConnectionId: classification.oldConnectionId,
            mappings: classification.mappings,
            log,
          });
        }

        return executeFirstConnection({
          trx,
          params,
          provider,
          providerInfo,
          accessToken,
          itemId,
          connection,
          institution,
          providerAccounts,
          bankId,
          bankLogoUrl,
          providerBankName,
          bankProviderMappingId,
          log,
        });
      });

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

type ConnectContext = {
  trx: Knex.Transaction;
  params: ConnectAccountsParams;
  provider: {
    supportsTransactionSync: () => boolean;
  };
  accessToken: string;
  connection: { metadata?: Record<string, unknown> };
  institution: {
    name: string;
    logoUrl?: string | null;
  };
  providerAccounts: ProviderAccount[];
  bankId: string;
  bankLogoUrl: string | null;
  providerBankName: string;
  log: (phase: string, data: Record<string, unknown>) => void;
};

async function executeFirstConnection(
  input: ConnectContext & {
    providerInfo: { id: string; name: string };
    itemId?: string;
    bankProviderMappingId: string | null;
  },
): Promise<ApiResponse<ConnectAccountsResultData>> {
  const {
    trx,
    params,
    provider,
    providerInfo,
    accessToken,
    itemId,
    connection,
    institution,
    providerAccounts,
    bankId,
    bankLogoUrl,
    providerBankName,
    bankProviderMappingId,
    log,
  } = input;

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

  const { syncFromDate, companyTimezone } = await resolveSyncFromDate(
    trx,
    params.companyId,
  );

  const { accounts, newCount, updatedCount } = await createFeedsForAccounts({
    trx,
    params,
    provider,
    providerAccounts,
    bankId,
    connectionId,
    syncFromDate,
    companyTimezone,
    providerName: providerInfo.name,
    replacesByProviderAccountId: new Map(),
    syncTrigger: 'initial',
    log,
  });

  return successResponse(buildConnectMessage(newCount, updatedCount), {
    bank: {
      id: bankId,
      name: providerBankName ?? institution.name,
      logoUrl: bankLogoUrl,
    },
    accounts,
    outcome: 'connected',
  });
}

async function executeReauthorizeConnection(
  input: ConnectContext & { connectionId: string },
): Promise<ApiResponse<ConnectAccountsResultData>> {
  const {
    trx,
    params,
    provider,
    accessToken,
    providerAccounts,
    bankId,
    bankLogoUrl,
    providerBankName,
    institution,
    connectionId,
    log,
  } = input;

  log('reauthorize_connection', { connectionId });

  const existingSecret = await trx('bank_connection_secrets')
    .where({ bank_connection_id: connectionId })
    .first('id');

  await reactivateConnectionForReauth({
    connectionId,
    companyId: params.companyId,
    updatedById: params.userId,
    trx,
  });

  const secretResult = await ensureActiveConnectionSecret({
    connectionId,
    companyId: params.companyId,
    accessToken,
    hadSecret: Boolean(existingSecret),
    trx,
  });
  if (!secretResult.success) {
    throw new Error(
      secretResult.message || 'Failed to rotate connection secret',
    );
  }

  await bumpActiveFeedStateVersions({
    connectionId,
    companyId: params.companyId,
    trx,
  });

  const existingFeeds = await trx('bank_account_feeds')
    .where({
      bank_connection_id: connectionId,
      company_id: params.companyId,
    })
    .select<
      {
        id: string;
        provider_account_id: string;
        bank_account_id: string;
        revoked_at: Date | null;
      }[]
    >('id', 'provider_account_id', 'bank_account_id', 'revoked_at');

  const feedByProviderAccount = new Map(
    existingFeeds.map((feed) => [feed.provider_account_id, feed]),
  );

  const { syncFromDate, companyTimezone } = await resolveSyncFromDate(
    trx,
    params.companyId,
  );

  const accounts: ConnectedAccount[] = [];
  let newCount = 0;
  let resumedCount = 0;

  for (const account of providerAccounts) {
    if (!account.accountNumber?.trim()) {
      throw new Error(
        `Provider did not return an account number for ${account.displayName}; confirmation is required before this account can be connected`,
      );
    }

    const existing = feedByProviderAccount.get(account.accountId);
    if (existing) {
      if (existing.revoked_at != null) {
        const reactivated = await reactivateFeedForReauth({
          feedId: existing.id,
          companyId: params.companyId,
          trx,
        });
        if (!reactivated.success) {
          throw new Error(reactivated.message || 'Failed to reactivate feed');
        }
      }
      if (provider.supportsTransactionSync()) {
        await writeBankSyncOutbox(trx, {
          bankAccountId: existing.bank_account_id,
          trigger: 'manual',
          actorUserId: params.userId,
        });
      }
      accounts.push({
        id: existing.bank_account_id,
        feedId: existing.id,
        displayName: account.displayName ?? account.officialName,
        mask: account.mask || account.accountNumber?.slice(-4) || '****',
        currencyCode: account.currencyCode,
        businessOrPersonal: 'business',
      });
      resumedCount += 1;
      continue;
    }

    // Newly selected account on this item.
    const { bankAccountId, wasUpdated } = await createConnectedAccount({
      trx,
      userId: params.userId,
      companyId: params.companyId,
      bankId,
      providerName: 'provider',
      account,
    });
    const feedResult = await createBankAccountFeed({
      data: {
        company_id: params.companyId,
        bank_account_id: bankAccountId,
        bank_connection_id: connectionId,
        provider_account_id: account.accountId,
        sync_from_date: syncFromDate,
        sync_from_timezone: companyTimezone,
        provider_snapshot: sanitizeProviderSnapshot(account.rawData, 'account'),
        provider_snapshot_version: account.rawData ? 1 : null,
        provider_snapshot_captured_at: account.rawData ? new Date() : null,
        connected_by_id: params.userId,
      },
      trx,
    });
    if (!feedResult.success || !feedResult.data?.id) {
      throw new Error(
        `Failed to create feed for account ${account.displayName}: ${feedResult.message}`,
      );
    }
    await createHistoryImport({
      bankAccountFeedId: feedResult.data.id,
      companyId: params.companyId,
      trx,
    });
    if (provider.supportsTransactionSync()) {
      await writeBankSyncOutbox(trx, {
        bankAccountId,
        trigger: 'initial',
        actorUserId: params.userId,
      });
    }
    accounts.push({
      id: bankAccountId,
      feedId: feedResult.data.id,
      displayName: account.displayName ?? account.officialName,
      mask: account.mask || account.accountNumber?.slice(-4) || '****',
      currencyCode: account.currencyCode,
      businessOrPersonal: 'business',
    });
    if (wasUpdated) {
      // durable account reused
    } else {
      newCount += 1;
    }
  }

  for (const account of accounts) {
    try {
      await writeBankReconnectNotificationLifecycle(trx, {
        bankAccountId: account.id,
        clientCompanyId: params.companyId,
        previousConnectionStatus: 'error',
        nextConnectionStatus: 'connected',
        bankAccountName: account.displayName,
        stateVersion: new Date(),
      });
    } catch {
      // Resolving attention is best-effort; connect must not fail on it.
    }
  }

  const message =
    newCount > 0
      ? `Reconnected. ${resumedCount} account(s) resumed and ${newCount} new account(s) linked.`
      : `Reconnected. ${resumedCount} account(s) resumed.`;

  return successResponse(message, {
    bank: {
      id: bankId,
      name: providerBankName ?? institution.name,
      logoUrl: bankLogoUrl,
    },
    accounts,
    outcome: 'reauthorized',
  });
}

async function executeReplaceConnection(
  input: ConnectContext & {
    providerInfo: { id: string; name: string };
    itemId?: string;
    bankProviderMappingId: string | null;
    oldConnectionId: string;
    mappings: Array<{
      oldFeedId: string;
      oldConnectionId: string;
      bankAccountId: string;
      providerAccountId: string;
    }>;
  },
): Promise<ApiResponse<ConnectAccountsResultData>> {
  const {
    trx,
    params,
    provider,
    providerInfo,
    accessToken,
    itemId,
    connection,
    institution,
    providerAccounts,
    bankId,
    bankLogoUrl,
    providerBankName,
    bankProviderMappingId,
    oldConnectionId,
    mappings,
    log,
  } = input;

  log('replace_connection', { oldConnectionId });

  // Guard: durable accounts that already have an active feed on another provider.
  for (const mapping of mappings) {
    const otherActive = await trx('bank_account_feeds as baf')
      .join('bank_connections as bc', 'bc.id', 'baf.bank_connection_id')
      .where({
        'baf.bank_account_id': mapping.bankAccountId,
        'baf.company_id': params.companyId,
      })
      .whereNull('baf.revoked_at')
      .whereNot('bc.provider_id', providerInfo.id)
      .first('baf.id');
    if (otherActive) {
      return errorResponse<ConnectAccountsResultData>(
        'Account already has an active feed from another provider; confirmation UI required',
        null,
      );
    }
  }

  const revoked = await revokeConnectionAndDestroySecret({
    connectionId: oldConnectionId,
    companyId: params.companyId,
    revokedById: params.userId,
    revocationOrigin: 'client',
    revocationReason: 'Replaced by new provider item',
    trx,
  });
  if (!revoked.success) {
    throw new Error(revoked.message || 'Failed to revoke old connection');
  }

  const oldFeedIds = [...new Set(mappings.map((m) => m.oldFeedId))];
  for (const oldFeedId of oldFeedIds) {
    await deleteAllHistoryCandidates({
      bankAccountFeedId: oldFeedId,
      trx,
    });
    await refreshHistoryImportAggregates({
      bankAccountFeedId: oldFeedId,
      trx,
    });
    await markHistoryImportStatus({
      bankAccountFeedId: oldFeedId,
      companyId: params.companyId,
      status: 'unavailable',
      trx,
    });
    await resolveHistoryImportAttention(trx, {
      clientCompanyId: params.companyId,
      feedId: oldFeedId,
      stateVersion: new Date(),
    });
  }

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
      connectionResult.message || 'Failed to save replacement connection',
    );
  }
  const connectionId = connectionResult.data.id;

  const secretResult = await createBankConnectionSecret({
    connectionId,
    companyId: params.companyId,
    accessToken,
    trx,
  });
  if (!secretResult.success) {
    throw new Error(
      secretResult.message || 'Failed to save replacement connection secret',
    );
  }

  const replacesByProviderAccountId = new Map(
    mappings.map((m) => [m.providerAccountId, m.oldFeedId]),
  );
  // Also map by durable bank account when provider account ids changed but
  // fingerprint reused the same bank_accounts row — handled after account create.

  const { syncFromDate, companyTimezone } = await resolveSyncFromDate(
    trx,
    params.companyId,
  );

  const oldFeedByBankAccount = new Map(
    mappings.map((m) => [m.bankAccountId, m.oldFeedId]),
  );

  const accounts: ConnectedAccount[] = [];
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
    });

    const { bankAccountId, wasUpdated } = await createConnectedAccount({
      trx,
      userId: params.userId,
      companyId: params.companyId,
      bankId,
      providerName: providerInfo.name,
      account,
    });

    const replacesFeedId =
      replacesByProviderAccountId.get(account.accountId) ??
      oldFeedByBankAccount.get(bankAccountId) ??
      null;

    const feedResult = await createBankAccountFeed({
      data: {
        company_id: params.companyId,
        bank_account_id: bankAccountId,
        bank_connection_id: connectionId,
        provider_account_id: account.accountId,
        sync_from_date: syncFromDate,
        sync_from_timezone: companyTimezone,
        provider_snapshot: sanitizeProviderSnapshot(account.rawData, 'account'),
        provider_snapshot_version: account.rawData ? 1 : null,
        provider_snapshot_captured_at: account.rawData ? new Date() : null,
        connected_by_id: params.userId,
        replaces_bank_account_feed_id: replacesFeedId,
      },
      trx,
    });
    if (!feedResult.success || !feedResult.data?.id) {
      throw new Error(
        `Failed to create feed for account ${account.displayName}: ${feedResult.message}`,
      );
    }

    await createHistoryImport({
      bankAccountFeedId: feedResult.data.id,
      companyId: params.companyId,
      trx,
    });

    if (provider.supportsTransactionSync()) {
      await writeBankSyncOutbox(trx, {
        bankAccountId,
        trigger: 'initial',
        actorUserId: params.userId,
      });
    }

    if (account.reportedCurrentBalance) {
      await updateProviderReportedBalance({
        companyId: params.companyId,
        bankAccountId,
        balance: account.reportedCurrentBalance.amount,
        asOf: account.reportedCurrentBalance.asOf,
        client: trx,
      });
    }

    accounts.push({
      id: bankAccountId,
      feedId: feedResult.data.id,
      displayName: account.displayName ?? account.officialName,
      mask: account.mask || account.accountNumber?.slice(-4) || '****',
      currencyCode: account.currencyCode,
      businessOrPersonal: 'business',
    });

    if (wasUpdated) updatedCount += 1;
    else newCount += 1;
  }

  return successResponse('Connection replaced successfully.', {
    bank: {
      id: bankId,
      name: providerBankName ?? institution.name,
      logoUrl: bankLogoUrl,
    },
    accounts,
    outcome: 'replaced',
  });
}

async function createFeedsForAccounts(input: {
  trx: Knex.Transaction;
  params: ConnectAccountsParams;
  provider: { supportsTransactionSync: () => boolean };
  providerAccounts: ProviderAccount[];
  bankId: string;
  connectionId: string;
  syncFromDate: string;
  companyTimezone: string;
  providerName: string;
  replacesByProviderAccountId: Map<string, string>;
  syncTrigger: 'initial' | 'manual';
  log: (phase: string, data: Record<string, unknown>) => void;
}): Promise<{
  accounts: ConnectedAccount[];
  newCount: number;
  updatedCount: number;
}> {
  const accounts: ConnectedAccount[] = [];
  let newCount = 0;
  let updatedCount = 0;

  for (const [index, account] of input.providerAccounts.entries()) {
    if (!account.accountNumber?.trim()) {
      throw new Error(
        `Provider did not return an account number for ${account.displayName}; confirmation is required before this account can be connected`,
      );
    }
    input.log('creating_account', {
      index: index + 1,
      total: input.providerAccounts.length,
      accountId: account.accountId,
      displayName: account.displayName,
    });

    const { bankAccountId, wasUpdated } = await createConnectedAccount({
      trx: input.trx,
      userId: input.params.userId,
      companyId: input.params.companyId,
      bankId: input.bankId,
      providerName: input.providerName,
      account,
    });

    const feedResult = await createBankAccountFeed({
      data: {
        company_id: input.params.companyId,
        bank_account_id: bankAccountId,
        bank_connection_id: input.connectionId,
        provider_account_id: account.accountId,
        sync_from_date: input.syncFromDate,
        sync_from_timezone: input.companyTimezone,
        provider_snapshot: sanitizeProviderSnapshot(account.rawData, 'account'),
        provider_snapshot_version: account.rawData ? 1 : null,
        provider_snapshot_captured_at: account.rawData ? new Date() : null,
        connected_by_id: input.params.userId,
        replaces_bank_account_feed_id:
          input.replacesByProviderAccountId.get(account.accountId) ?? null,
      },
      trx: input.trx,
    });
    if (!feedResult.success || !feedResult.data?.id) {
      throw new Error(
        `Failed to create feed for account ${account.displayName}: ${feedResult.message}`,
      );
    }

    await createHistoryImport({
      bankAccountFeedId: feedResult.data.id,
      companyId: input.params.companyId,
      trx: input.trx,
    });

    if (input.provider.supportsTransactionSync()) {
      await writeBankSyncOutbox(input.trx, {
        bankAccountId,
        trigger: input.syncTrigger,
        actorUserId: input.params.userId,
      });
    }

    if (account.reportedCurrentBalance) {
      await updateProviderReportedBalance({
        companyId: input.params.companyId,
        bankAccountId,
        balance: account.reportedCurrentBalance.amount,
        asOf: account.reportedCurrentBalance.asOf,
        client: input.trx,
      });
    }

    accounts.push({
      id: bankAccountId,
      feedId: feedResult.data.id,
      displayName: account.displayName ?? account.officialName,
      mask: account.mask || account.accountNumber?.slice(-4) || '****',
      currencyCode: account.currencyCode,
      businessOrPersonal: 'business',
    });

    if (wasUpdated) updatedCount += 1;
    else newCount += 1;
  }

  return { accounts, newCount, updatedCount };
}

function buildConnectMessage(newCount: number, updatedCount: number): string {
  const plural = (n: number) => (n > 1 ? 's' : '');
  if (updatedCount === 0) {
    return `All set! ${newCount} new account${plural(newCount)} connected successfully.`;
  }
  if (newCount === 0) {
    return `All set! ${updatedCount} existing account${plural(updatedCount)} reconnected successfully.`;
  }
  return `All set! ${newCount} new account${plural(newCount)} connected and ${updatedCount} updated successfully.`;
}

async function resolveSyncFromDate(
  trx: Knex.Transaction,
  companyId: string,
): Promise<{ syncFromDate: string; companyTimezone: string }> {
  const companyRow = await trx('companies')
    .where({ id: companyId })
    .first<{ default_timezone: string }>('default_timezone');
  const companyTimezone = companyRow?.default_timezone || 'Etc/UTC';
  const syncFromDate = formatInTimeZone(
    new Date(),
    companyTimezone,
    'yyyy-MM-dd',
  );
  return { syncFromDate, companyTimezone };
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
      businessOrPersonal: 'business',
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

export const connectAccountsService = new ConnectAccountsService();
