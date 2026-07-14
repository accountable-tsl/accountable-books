import { createHash } from 'crypto';

import { knexClient } from '../../../db/knexClient.js';
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

import type { BankAccountConnectionStatus } from '../../../domains/banking/bankAccounts/bankAccounts.types.js';
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
  'credential is not active: expired',
  'credential is not active: revoked',
];

interface SyncFailureCredential {
  id: string;
  provider_id: string;
}

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
  credential: SyncFailureCredential | null;
  providerKey: string | null;
  error: unknown;
  traceId: string;
}): Promise<void> {
  const failure = classifyTransactionSyncFailure(input.error);
  if (
    failure.classification === 'auth_reconnect' &&
    input.account &&
    input.credential
  ) {
    try {
      await markCredentialAccountsReconnectRequired({
        credentialId: input.credential.id,
        companyId: input.account.company_id,
        syncError: failure.displayMessage || failure.message,
      });
      return;
    } catch (handlerError) {
      logger.error(
        {
          traceId: input.traceId,
          bankAccountId: input.bankAccountId,
          error: syncErrorMessage(handlerError),
        },
        'Failed to mark credential accounts for reconnect',
      );
    }
  }

  if (input.account && input.credential) {
    try {
      const stateVersion = new Date();
      await knexClient.transaction(async (trx) => {
        const updated = await trx('bank_accounts')
          .where({
            id: input.account!.id,
            connection_credential_id: input.credential!.id,
            provider_bank_account_id: input.account!.provider_bank_account_id,
          })
          .update({
            sync_error: (failure.displayMessage || failure.message).slice(
              0,
              2048,
            ),
            updated_at: stateVersion,
          });
        if (updated === 0) return;
        if (input.error instanceof AccountTransactionApplyError) {
          await writeBankSyncFailureRequiresActionNotifications(trx, {
            clientCompanyId: input.account!.company_id,
            credentialId: input.credential!.id,
            failures: [
              {
                bankAccountId: input.account!.id,
                error: input.error.message,
                failedTransactionCount: input.error.failedTransactionCount,
              },
            ],
            stateVersion,
          });
        }
      });
    } catch (stateError) {
      logger.error(
        {
          traceId: input.traceId,
          bankAccountId: input.bankAccountId,
          error: syncErrorMessage(stateError),
        },
        'Failed to record bank account sync error',
      );
    }
  }

  await alertAdminsForSyncFailure({
    bankAccountId: input.bankAccountId,
    credentialId: input.credential?.id || '',
    companyId: input.account?.company_id || '',
    providerId: input.credential?.provider_id || '',
    providerKey: input.providerKey,
    error: input.error,
    failure,
    traceId: input.traceId,
  });
}

async function markCredentialAccountsReconnectRequired(input: {
  credentialId: string;
  companyId: string;
  syncError: string;
}): Promise<number> {
  return knexClient.transaction(async (trx) => {
    const accounts = await trx('app.bank_accounts')
      .where({
        company_id: input.companyId,
        connection_credential_id: input.credentialId,
      })
      .whereIn('connection_status', ['connected', 'error'])
      .forUpdate()
      .select('id', 'connection_status', 'display_name', 'sync_error');

    let intentCount = 0;
    for (const account of accounts) {
      const previousConnectionStatus =
        account.connection_status as BankAccountConnectionStatus;
      const [updated] = await trx('app.bank_accounts')
        .where({ id: account.id })
        .update({
          connection_status: 'error',
          sync_error: input.syncError.slice(0, 2048),
          updated_at: trx.fn.now(),
        })
        .returning([
          'id',
          'connection_status',
          'display_name',
          'sync_error',
          'updated_at',
        ]);
      if (!updated) continue;
      intentCount += await writeBankReconnectNotificationLifecycle(trx, {
        bankAccountId: updated.id as string,
        clientCompanyId: input.companyId,
        previousConnectionStatus,
        nextConnectionStatus:
          updated.connection_status as BankAccountConnectionStatus,
        bankAccountName: updated.display_name as string,
        previousSyncError: account.sync_error as string | null,
        syncError: updated.sync_error as string | null,
        stateVersion: updated.updated_at as Date | string,
      });
    }
    return intentCount;
  });
}

function failureFingerprint(input: {
  bankAccountId: string;
  credentialId: string;
  providerId: string;
  failure: ClassifiedTransactionSyncFailure;
}): string {
  return createHash('sha256')
    .update(
      [
        input.bankAccountId,
        input.credentialId,
        input.providerId,
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
  credentialId: string;
  companyId: string;
  providerId: string;
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
          credentialId: input.credentialId,
          providerId: input.providerId || 'unknown-provider',
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
        credentialId: input.credentialId || null,
        companyId: input.companyId || null,
        providerId: input.providerId || null,
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
