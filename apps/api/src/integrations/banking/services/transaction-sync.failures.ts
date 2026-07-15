import { createHash } from 'crypto';

import { knexClient } from '../../../db/knexClient.js';
import { markConnectionRequiresAction } from '../../../domains/banking/bank-connections/bank-connections.model.js';
import { completeSyncRun } from '../../../domains/banking/bank-transaction-sync-runs/bank-transaction-sync-runs.model.js';
import {
  writeBankReconnectNotificationLifecycle,
  writeBankSyncFailureRequiresActionNotifications,
} from '../../../domains/banking/bankAccounts/bankAccountNotifications.js';
import { alertAdmins } from '../../../features/comms/admin-alerts.js';
import { logger } from '../../../shared/utils/logger.js';
import {
  AccountTransactionApplyError,
  isProviderError,
  syncErrorMessage,
} from './transaction-sync.errors.js';

import type {
  BankAccountForSync,
  ClassifiedTransactionSyncFailure,
} from './transaction-sync.types.js';

const AUTH_RECONNECT_ERROR_CODES = new Set([
  'ITEM_LOGIN_REQUIRED',
  'INVALID_ACCESS_TOKEN',
  'INVALID_CREDENTIALS',
  'INSUFFICIENT_CREDENTIALS',
  'USER_SETUP_REQUIRED',
  'MONO_401',
  'MONO_404',
]);

const AUTH_RECONNECT_TEXT_PATTERNS = [
  'please reconnect',
  'reconnect your bank account',
  're-auth',
  'reauth',
  'login required',
  'authentication failed',
  'bank account not found',
];

export function classifyTransactionSyncFailure(
  error: unknown,
): ClassifiedTransactionSyncFailure {
  const providerError = isProviderError(error) ? error : null;
  const code = providerError?.code ?? 'UNKNOWN_TRANSACTION_SYNC_ERROR';
  const message = providerError?.message ?? syncErrorMessage(error);
  const displayMessage = providerError?.displayMessage ?? message;
  const retryable = providerError?.retryable ?? false;
  const searchableText = [code, message, displayMessage]
    .join(' ')
    .toLowerCase();
  const isAuthReconnect =
    AUTH_RECONNECT_ERROR_CODES.has(code.toUpperCase()) ||
    AUTH_RECONNECT_TEXT_PATTERNS.some((pattern) =>
      searchableText.includes(pattern),
    );

  return {
    classification: isAuthReconnect
      ? 'auth_reconnect'
      : 'internal_provider_system',
    code,
    message,
    displayMessage,
    retryable,
  };
}

export async function handleTransactionSyncFailure(input: {
  bankAccountId: string;
  account: BankAccountForSync | null;
  providerKey: string | null;
  syncRunId: string | null;
  error: unknown;
  traceId: string;
}): Promise<void> {
  const failure = classifyTransactionSyncFailure(input.error);

  if (input.syncRunId && input.account) {
    try {
      const completed = await completeSyncRun({
        syncRunId: input.syncRunId,
        companyId: input.account.company_id,
        outcome: 'failed',
        retryable: failure.retryable,
        failureClassification: failure.classification,
        providerErrorCode: failure.code,
        diagnosticSummary: (failure.displayMessage || failure.message).slice(
          0,
          2048,
        ),
      });
      if (!completed.success) {
        throw new Error(
          completed.message || 'Failed to complete transaction sync run',
        );
      }
    } catch (completionError) {
      logger.error(
        {
          traceId: input.traceId,
          bankAccountId: input.bankAccountId,
          error: syncErrorMessage(completionError),
        },
        'Failed to record transaction sync run failure',
      );
    }
  }

  if (failure.classification === 'auth_reconnect' && input.account) {
    try {
      await markConnectionAndNotifyReconnectRequired({
        connectionId: input.account.bank_connection_id,
        companyId: input.account.company_id,
        reasonCode: failure.code,
        syncError: failure.displayMessage || failure.message,
      });
    } catch (handlerError) {
      logger.error(
        {
          traceId: input.traceId,
          bankAccountId: input.bankAccountId,
          error: syncErrorMessage(handlerError),
        },
        'Failed to mark bank connection for reconnect',
      );
    }
  }

  if (input.error instanceof AccountTransactionApplyError && input.account) {
    const applyError = input.error;
    const account = input.account;
    try {
      await knexClient.transaction((trx) =>
        writeBankSyncFailureRequiresActionNotifications(trx, {
          clientCompanyId: account.company_id,
          connectionId: account.bank_connection_id,
          failures: [
            {
              bankAccountId: account.bank_account_id,
              error: applyError.message,
              failedTransactionCount: applyError.failedTransactionCount,
            },
          ],
          stateVersion: new Date(),
        }),
      );
    } catch (handlerError) {
      logger.error(
        {
          traceId: input.traceId,
          bankAccountId: input.bankAccountId,
          error: syncErrorMessage(handlerError),
        },
        'Failed to write bank sync failure requires-action notifications',
      );
    }
  }

  await alertAdminsForSyncFailure({
    bankAccountId: input.bankAccountId,
    connectionId: input.account?.bank_connection_id || '',
    companyId: input.account?.company_id || '',
    providerKey: input.providerKey,
    error: input.error,
    failure,
    traceId: input.traceId,
  });
}

/** Called only for failures already classified as requiring reauthorization. */
async function markConnectionAndNotifyReconnectRequired(input: {
  connectionId: string;
  companyId: string;
  reasonCode: string;
  syncError: string;
}): Promise<number> {
  return knexClient.transaction(async (trx) => {
    const connection = await trx('bank_connections')
      .where({ id: input.connectionId, company_id: input.companyId })
      .first<{
        id: string;
        authorization_status: string;
      }>('id', 'authorization_status');

    if (!connection) {
      throw new Error('Bank connection not found');
    }

    const accounts = await trx('bank_account_feeds as f')
      .join('bank_accounts as ba', 'ba.id', 'f.bank_account_id')
      .where({
        'f.bank_connection_id': input.connectionId,
        'f.company_id': input.companyId,
        'ba.is_deleted': false,
      })
      .whereNull('f.revoked_at')
      .select<{ id: string; display_name: string }[]>(
        'ba.id',
        'ba.display_name',
      );
    const previousConnectionStatus =
      connection.authorization_status === 'active'
        ? ('connected' as const)
        : ('error' as const);

    const marked = await markConnectionRequiresAction({
      connectionId: input.connectionId,
      companyId: input.companyId,
      reasonCode: input.reasonCode,
      trx,
    });
    if (!marked.success) {
      throw new Error(
        marked.message || 'Failed to mark bank connection requires action',
      );
    }

    let intentCount = 0;
    const stateVersion = new Date();
    for (const account of accounts) {
      intentCount += await writeBankReconnectNotificationLifecycle(trx, {
        bankAccountId: account.id,
        clientCompanyId: input.companyId,
        previousConnectionStatus,
        nextConnectionStatus: 'error',
        bankAccountName: account.display_name,
        previousSyncError:
          previousConnectionStatus === 'error' ? input.syncError : null,
        syncError: input.syncError,
        stateVersion,
      });
    }
    return intentCount;
  });
}

function failureFingerprint(input: {
  bankAccountId: string;
  connectionId: string;
  failure: ClassifiedTransactionSyncFailure;
}): string {
  return createHash('sha256')
    .update(
      [
        input.bankAccountId,
        input.connectionId,
        input.failure.classification,
        input.failure.code,
        input.failure.message,
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 24);
}

function dateBucket(value = new Date()): string {
  return value.toISOString().slice(0, 10);
}

async function alertAdminsForSyncFailure(input: {
  bankAccountId: string;
  connectionId: string;
  companyId: string;
  providerKey: string | null;
  error: unknown;
  failure: ClassifiedTransactionSyncFailure;
  traceId: string;
}): Promise<void> {
  try {
    await alertAdmins({
      idempotencyKey: [
        'bank-sync',
        'admin-alert',
        input.bankAccountId,
        failureFingerprint({
          bankAccountId: input.bankAccountId,
          connectionId: input.connectionId || 'unknown-connection',
          failure: input.failure,
        }),
        dateBucket(),
      ].join(':'),
      eventType: 'bank.transaction_sync_failed',
      priority: 'critical',
      title: 'Bank transaction sync failed',
      body:
        input.failure.displayMessage ||
        input.failure.message ||
        syncErrorMessage(input.error),
      data: {
        bankAccountId: input.bankAccountId,
        classification: input.failure.classification,
        code: input.failure.code,
        message: input.failure.message,
        displayMessage: input.failure.displayMessage,
        retryable: input.failure.retryable,
        connectionId: input.connectionId || null,
        companyId: input.companyId || null,
        providerKey: input.providerKey,
        traceId: input.traceId,
      },
    });
  } catch (alertError) {
    logger.error(
      {
        traceId: input.traceId,
        bankAccountId: input.bankAccountId,
        error: syncErrorMessage(alertError),
      },
      'Failed to alert administrators about bank account sync failure',
    );
  }
}
