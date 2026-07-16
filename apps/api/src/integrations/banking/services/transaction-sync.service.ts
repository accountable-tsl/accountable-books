import { randomUUID } from 'crypto';

import { knexClient } from '../../../db/knexClient.js';
import { loadSecretForProviderExecution } from '../../../domains/banking/bank-connection-secrets/bank-connection-secrets.model.js';
import {
  completeSyncRun,
  createSyncRun,
} from '../../../domains/banking/bank-transaction-sync-runs/bank-transaction-sync-runs.model.js';
import { getSystemUser } from '../../../domains/users/users.model.js';
import { logger } from '../../../shared/utils/logger.js';
import { providerRegistry } from '../providers/registry.js';
import { applyCompleteTransactionUpdate } from './transaction-sync.applier.js';
import {
  StaleBankAccountSyncError,
  syncErrorMessage,
  TransactionSyncLockBusyError,
} from './transaction-sync.errors.js';
import { handleTransactionSyncFailure } from './transaction-sync.failures.js';
import {
  acquireAccountTransactionSyncLock,
  releaseAccountTransactionSyncLock,
} from './transaction-sync.lock.js';
import { TRANSACTION_SYNC_RUN_TRIGGER } from './transaction-sync.types.js';

import type { BankConnectionAuthorizationStatus } from '../../../domains/banking/bank-connections/bank-connections.types.js';
import type { BankingProvider } from '../types/base.js';
import type {
  BankAccountForSync,
  BankAccountSyncResult,
  TransactionSyncCommand,
} from './transaction-sync.types.js';

export { TransactionSyncLockBusyError } from './transaction-sync.errors.js';
export { isRetryableTransactionSyncFailure } from './transaction-sync.errors.js';
export { classifyTransactionSyncFailure } from './transaction-sync.failures.js';
export type {
  BankAccountSyncResult,
  TransactionSyncFailureClassification,
  TransactionSyncTrigger,
} from './transaction-sync.types.js';

function emptySyncResult(
  bankAccountId: string,
  initialSync: boolean,
  outcome: 'not_ready' | 'unsupported',
): BankAccountSyncResult {
  return {
    bankAccountId,
    outcome,
    initialSync,
    added: 0,
    modified: 0,
    removed: 0,
  };
}

interface LoadedBankAccountForSync {
  account: BankAccountForSync;
  providerId: string;
  authorizationStatus: BankConnectionAuthorizationStatus;
}

// Inactive/requires_action still returned so callers can classify unsupported vs missing.
async function loadBankAccount(
  bankAccountId: string,
): Promise<LoadedBankAccountForSync | null> {
  const row = await knexClient('bank_account_feeds as baf')
    .innerJoin('bank_connections as bc', 'bc.id', 'baf.bank_connection_id')
    .innerJoin('bank_accounts as ba', 'ba.id', 'baf.bank_account_id')
    .where({ 'baf.bank_account_id': bankAccountId, 'ba.is_deleted': false })
    .whereNull('baf.revoked_at')
    .first<{
      bank_account_id: string;
      feed_id: string;
      company_id: string;
      bank_connection_id: string;
      provider_account_id: string;
      sync_cursor: string | null;
      sync_from_date: Date | null;
      initial_sync_completed_at: Date | null;
      last_successful_sync_at: Date | null;
      state_version: number;
      provider_id: string;
      authorization_status: BankConnectionAuthorizationStatus;
    }>(['ba.id as bank_account_id', 'baf.id as feed_id', 'baf.company_id as company_id', 'baf.bank_connection_id as bank_connection_id', 'baf.provider_account_id as provider_account_id', 'baf.sync_cursor as sync_cursor', 'baf.sync_from_date as sync_from_date', 'baf.initial_sync_completed_at as initial_sync_completed_at', 'baf.last_successful_sync_at as last_successful_sync_at', 'baf.state_version as state_version', 'bc.provider_id as provider_id', 'bc.authorization_status as authorization_status']);
  if (!row) return null;

  return {
    account: {
      bank_account_id: row.bank_account_id,
      feed_id: row.feed_id,
      company_id: row.company_id,
      bank_connection_id: row.bank_connection_id,
      provider_account_id: row.provider_account_id,
      sync_cursor: row.sync_cursor,
      sync_from_date: row.sync_from_date,
      initial_sync_completed_at: row.initial_sync_completed_at,
      last_successful_sync_at: row.last_successful_sync_at,
      state_version: row.state_version,
      is_deleted: false,
    },
    providerId: row.provider_id,
    authorizationStatus: row.authorization_status,
  };
}

async function getSystemUserId(): Promise<string> {
  const user = await getSystemUser();
  return user.id;
}

export class TransactionSyncService {
  async syncBankAccount({
    bankAccountId,
    trigger,
    actorUserId,
  }: TransactionSyncCommand): Promise<BankAccountSyncResult> {
    const traceId = randomUUID();
    const startedAt = Date.now();
    let account: BankAccountForSync | null = null;
    let provider: BankingProvider | null = null;
    let lockAcquired = false;
    let syncRunId: string | null = null;

    const log = (phase: string, data: Record<string, unknown> = {}) => {
      logger.info(
        {
          traceId,
          bankAccountId,
          trigger,
          phase,
          duration_ms: Date.now() - startedAt,
          ...data,
        },
        `[${traceId}] Bank account transaction sync: ${phase}`,
      );
    };

    try {
      const loaded = await loadBankAccount(bankAccountId);
      if (!loaded) {
        log('unsupported', { reason: 'No active feed for account' });
        return emptySyncResult(bankAccountId, true, 'unsupported');
      }
      account = loaded.account;
      const initialSync = !account.initial_sync_completed_at;

      if (loaded.authorizationStatus !== 'active') {
        log('unsupported', {
          reason: 'Connection not active',
          authorizationStatus: loaded.authorizationStatus,
        });
        return emptySyncResult(bankAccountId, initialSync, 'unsupported');
      }

      lockAcquired = await acquireAccountTransactionSyncLock(
        bankAccountId,
        traceId,
      );
      if (!lockAcquired) {
        throw new TransactionSyncLockBusyError(bankAccountId);
      }

      const syncRunResult = await createSyncRun({
        data: {
          bank_account_feed_id: account.feed_id,
          company_id: account.company_id,
          trigger: TRANSACTION_SYNC_RUN_TRIGGER[trigger],
          sync_mode: initialSync ? 'initial' : 'incremental',
          trace_id: traceId,
          observed_state_version: account.state_version,
        },
      });
      if (!syncRunResult.success || !syncRunResult.data) {
        throw new Error(
          `Failed to create sync run: ${syncRunResult.message || 'Unknown error'}`,
        );
      }
      syncRunId = syncRunResult.data.id;

      provider = (await providerRegistry.getById(loaded.providerId)) ?? null;
      if (!provider || !provider.supportsTransactionSync()) {
        const skipped = await completeSyncRun({
          syncRunId,
          companyId: account.company_id,
          outcome: 'skipped',
          diagnosticSummary: 'Provider does not support transaction sync',
        });
        if (!skipped.success) {
          throw new Error(skipped.message || 'Failed to skip sync run');
        }
        log('unsupported', { providerId: loaded.providerId });
        return emptySyncResult(bankAccountId, initialSync, 'unsupported');
      }

      const secretResult = await loadSecretForProviderExecution({
        connectionId: account.bank_connection_id,
        companyId: account.company_id,
      });
      if (!secretResult.success || !secretResult.data) {
        throw new Error(
          `Connection secret unavailable: ${secretResult.message || 'Unknown error'}`,
        );
      }
      const { access_token: accessToken } = secretResult.data;

      const startingCheckpoint = account.sync_cursor || null;

      log('fetch_started', {
        providerKey: provider.key,
        initialSync,
        hasCheckpoint: Boolean(startingCheckpoint),
      });

      const fetchStartedAt = Date.now();
      const update = await provider.fetchTransactionUpdate({
        accessToken,
        providerBankAccountId: account.provider_account_id,
        checkpoint: startingCheckpoint,
        lastSuccessfulSyncAt: account.last_successful_sync_at,
        isInitialSync: initialSync,
      });
      log('fetch_completed', {
        phase_duration_ms: Date.now() - fetchStartedAt,
        pageCount: update.pageCount,
        historyStatus: update.historyStatus,
        transactionCount:
          update.observedTransactions.length +
          update.removedTransactionIds.length,
        approximatePayloadBytes: update.approximatePayloadBytes,
      });

      // Provider-neutral not-ready rule: nothing observed, nothing removed,
      // no checkpoint to store, and the provider is still preparing data.
      if (
        update.observedTransactions.length === 0 &&
        update.removedTransactionIds.length === 0 &&
        update.nextCheckpoint === null &&
        update.historyStatus === 'collecting'
      ) {
        const skipped = await completeSyncRun({
          syncRunId,
          companyId: account.company_id,
          outcome: 'skipped',
          pageCount: update.pageCount,
          diagnosticSummary: 'Provider transaction stream is not ready',
        });
        if (!skipped.success) {
          throw new Error(skipped.message || 'Failed to skip sync run');
        }
        log('not_ready');
        return emptySyncResult(bankAccountId, initialSync, 'not_ready');
      }

      const userId = actorUserId || (await getSystemUserId());

      const applyStartedAt = Date.now();
      const counts = await applyCompleteTransactionUpdate({
        account,
        syncRunId,
        update,
        startingCheckpoint,
        userId,
      });
      log('apply_completed', {
        phase_duration_ms: Date.now() - applyStartedAt,
      });

      log('completed', counts as unknown as Record<string, unknown>);
      return {
        bankAccountId,
        outcome: 'completed',
        initialSync,
        historyStatus: update.historyStatus,
        ...counts,
      };
    } catch (error) {
      if (error instanceof TransactionSyncLockBusyError) {
        log('lock_busy');
        throw error;
      }

      if (error instanceof StaleBankAccountSyncError) {
        log('stale_work_aborted');
        if (syncRunId && account) {
          const stale = await completeSyncRun({
            syncRunId,
            companyId: account.company_id,
            outcome: 'stale',
            diagnosticSummary: 'Feed state changed before apply',
          });
          if (!stale.success) {
            logger.error(
              { traceId, bankAccountId, syncRunId },
              'Failed to mark transaction sync run stale',
            );
          }
        }
        throw error;
      }

      log('failed', { error: syncErrorMessage(error) });
      await handleTransactionSyncFailure({
        bankAccountId,
        account,
        providerKey: provider?.key ?? null,
        syncRunId,
        error,
        traceId,
      });
      throw error;
    } finally {
      if (lockAcquired) {
        await releaseAccountTransactionSyncLock(bankAccountId, traceId);
      }
    }
  }

  // Provider scope prevents cross-provider collisions; ambiguous tenant matches
  // fail closed rather than routing a webhook to an arbitrary connection.
  async findConnectionByItemId(input: {
    providerKey: string;
    itemId: string;
  }): Promise<{
    id: string;
    company_id: string;
    authorization_status: BankConnectionAuthorizationStatus;
    provider_snapshot: Record<string, unknown> | null;
  } | null> {
    const rows = await knexClient('bank_connections as bc')
      .innerJoin('bank_feed_providers as bfp', 'bfp.id', 'bc.provider_id')
      .where({
        'bc.provider_item_id': input.itemId,
        'bfp.key': input.providerKey,
      })
      .whereNot({ 'bc.authorization_status': 'revoked' })
      .limit(2)
      .select<
        {
          id: string;
          company_id: string;
          authorization_status: BankConnectionAuthorizationStatus;
          provider_snapshot: Record<string, unknown> | null;
        }[]
      >(
        'bc.id',
        'bc.company_id',
        'bc.authorization_status',
        'bc.provider_snapshot',
      );

    if (rows.length > 1) {
      logger.error(
        { providerKey: input.providerKey, matchCount: rows.length },
        'Ambiguous bank connection provider item lookup',
      );
      return null;
    }
    return rows[0] ?? null;
  }
}

export const transactionSyncService = new TransactionSyncService();
