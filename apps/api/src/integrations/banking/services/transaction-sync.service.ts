import { randomUUID } from 'crypto';

import { knexClient } from '../../../db/knexClient.js';
import { getBankAccountCredential } from '../../../domains/banking/bankAccountCredentials/bankAccountCredentials.model.js';
import { getSystemUser } from '../../../domains/users/users.model.js';
import { logger } from '../../../shared/utils/logger.js';
import { providerRegistry } from '../providers/registry.js';
import { TransactionSyncStrategy } from '../types/base.js';
import { applyCompleteTransactionUpdate } from './transaction-sync.applier.js';
import {
  StaleBankAccountSyncError,
  syncErrorMessage,
  TransactionSyncLockBusyError,
} from './transaction-sync.errors.js';
import { handleTransactionSyncFailure } from './transaction-sync.failures.js';
import {
  fetchCompleteTransactionUpdate,
  getTransactionSyncFromDate,
} from './transaction-sync.fetcher.js';
import {
  acquireAccountTransactionSyncLock,
  releaseAccountTransactionSyncLock,
} from './transaction-sync.lock.js';

import type { BankAccountCredential } from '../../../domains/banking/bankAccountCredentials/bankAccountCredentials.types.js';
import type { BankingProvider } from '../types/base.js';
import type {
  BankAccountForSync,
  BankAccountSyncResult,
  DecryptedBankAccountCredential,
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

async function loadBankAccount(
  bankAccountId: string,
): Promise<BankAccountForSync> {
  const account = await knexClient('bank_accounts')
    .where({ id: bankAccountId })
    .first<BankAccountForSync>([
      'id',
      'provider_bank_account_id',
      'connection_credential_id',
      'connection_status',
      'company_id',
      'transaction_sync_cursor',
      'initial_transaction_sync_completed_at',
      'last_sync_at',
      'is_deleted',
    ]);
  if (!account) throw new Error(`Bank account not found: ${bankAccountId}`);
  return account;
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
    let credential: DecryptedBankAccountCredential | null = null;
    let provider: BankingProvider | null = null;
    let lockAcquired = false;

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
      account = await loadBankAccount(bankAccountId);
      const initialSync = !account.initial_transaction_sync_completed_at;

      if (
        account.is_deleted ||
        account.connection_status !== 'connected' ||
        !account.connection_credential_id ||
        !account.provider_bank_account_id
      ) {
        log('unsupported', { reason: 'Account is not an active connection' });
        return emptySyncResult(bankAccountId, initialSync, 'unsupported');
      }

      const credentialResult = await getBankAccountCredential({
        credentialId: account.connection_credential_id,
        decryptToken: true,
        activeStatusOnly: false,
      });
      if (!credentialResult.success || !credentialResult.data) {
        throw new Error(
          `Credential lookup failed: ${credentialResult.message || 'Unknown error'}`,
        );
      }
      credential = credentialResult.data;
      if (credential.status !== 'active') {
        throw new Error(`Credential is not active: ${credential.status}`);
      }
      if (!credential.access_token) {
        throw new Error(`Credential has no access token: ${credential.id}`);
      }

      provider =
        (await providerRegistry.getById(credential.provider_id)) ?? null;
      if (!provider || !provider.supportsTransactionSync()) {
        log('unsupported', { providerId: credential.provider_id });
        return emptySyncResult(bankAccountId, initialSync, 'unsupported');
      }

      lockAcquired = await acquireAccountTransactionSyncLock(
        bankAccountId,
        traceId,
      );
      if (!lockAcquired) {
        throw new TransactionSyncLockBusyError(bankAccountId);
      }

      const usesDateRangeStrategy =
        provider.transactionSyncStrategy ===
        TransactionSyncStrategy.DATE_RANGE_OVERLAP;
      const startingCursor = usesDateRangeStrategy
        ? undefined
        : account.transaction_sync_cursor || undefined;
      const fromDate = getTransactionSyncFromDate({
        initialSync,
        usesDateRangeStrategy,
        credential,
        account,
      });

      log('fetch_started', {
        providerKey: provider.key,
        initialSync,
        hasCursor: Boolean(startingCursor),
        fromDate: fromDate?.toISOString(),
      });

      const fetchStartedAt = Date.now();
      const update = await fetchCompleteTransactionUpdate({
        provider,
        accessToken: credential.access_token,
        providerBankAccountId: account.provider_bank_account_id,
        startingCursor,
        fromDate,
        usesDateRangeStrategy,
      });
      log('fetch_completed', {
        phase_duration_ms: Date.now() - fetchStartedAt,
        pageCount: update.pageCount,
        transactionCount:
          update.added.length + update.modified.length + update.removed.length,
        approximatePayloadBytes: update.approximatePayloadBytes,
      });

      if (!usesDateRangeStrategy && !update.finalCursor) {
        if (
          update.added.length ||
          update.modified.length ||
          update.removed.length
        ) {
          throw new Error(
            'Cursor-based provider returned updates without a cursor',
          );
        }
        log('not_ready');
        return emptySyncResult(bankAccountId, initialSync, 'not_ready');
      }

      const userId = actorUserId || (await getSystemUserId());
      const applyStartedAt = Date.now();
      await applyCompleteTransactionUpdate({
        account,
        credential,
        update,
        startingCursor,
        usesDateRangeStrategy,
        userId,
      });
      log('apply_completed', {
        phase_duration_ms: Date.now() - applyStartedAt,
      });

      log('completed', {
        added: update.added.length,
        modified: update.modified.length,
        removed: update.removed.length,
      });
      return {
        bankAccountId,
        outcome: 'completed',
        initialSync,
        added: update.added.length,
        modified: update.modified.length,
        removed: update.removed.length,
      };
    } catch (error) {
      if (
        error instanceof TransactionSyncLockBusyError ||
        error instanceof StaleBankAccountSyncError
      ) {
        log(
          error instanceof TransactionSyncLockBusyError
            ? 'lock_busy'
            : 'stale_work_aborted',
        );
        throw error;
      }

      log('failed', { error: syncErrorMessage(error) });
      await handleTransactionSyncFailure({
        bankAccountId,
        account,
        credential,
        providerKey: provider?.key ?? null,
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

  async findCredentialByItemId(
    itemId: string,
  ): Promise<BankAccountCredential | null> {
    return (
      (await knexClient('bank_account_credentials')
        .where({ item_identifier: itemId, status: 'active' })
        .first()) || null
    );
  }

  async setTransactionSyncDate(
    credentialId: string,
    fromDate: Date,
    companyId?: string,
  ): Promise<boolean> {
    const query = knexClient('bank_account_credentials').where({
      id: credentialId,
    });
    if (companyId) query.andWhere({ company_id: companyId });
    const updated = await query.update({
      transactions_from_date: fromDate,
      updated_at: new Date(),
    });
    return updated > 0;
  }
}

export const transactionSyncService = new TransactionSyncService();
