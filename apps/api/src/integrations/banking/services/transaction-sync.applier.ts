import type { Knex } from 'knex';

import { knexClient } from '../../../db/knexClient.js';
import { scheduleBankBalanceAfterCommit } from '../../../domains/balances/index.js';
import { writeBankSyncFailureResolvedNotifications } from '../../../domains/banking/bankAccounts/bankAccountNotifications.js';
import { addNewBankTransactions } from '../../../domains/bankTransactions/bankTransactions.model.js';
import {
  AccountTransactionApplyError,
  StaleBankAccountSyncError,
  syncErrorMessage,
} from './transaction-sync.errors.js';

import type {
  BankTransactionBatchInput,
  BankTransactionInput,
} from '../../../domains/bankTransactions/bankTransactions.types.js';
import type { ProviderTransaction } from '../types/base.js';
import type {
  BankAccountForSync,
  CompleteTransactionUpdate,
  DecryptedBankAccountCredential,
} from './transaction-sync.types.js';

interface ApplyCompleteTransactionUpdateInput {
  account: BankAccountForSync;
  credential: DecryptedBankAccountCredential;
  update: CompleteTransactionUpdate;
  startingCursor?: string;
  usesDateRangeStrategy: boolean;
  userId: string;
}

function normalizeCursor(value: string | null | undefined): string | null {
  return value || null;
}

function normalizeTimestamp(value: Date | null | undefined): number | null {
  return value ? new Date(value).getTime() : null;
}

export async function applyCompleteTransactionUpdate(
  input: ApplyCompleteTransactionUpdateInput,
): Promise<void> {
  const completedAt = new Date();
  await knexClient.transaction(async (trx) => {
    const current = await trx('bank_accounts')
      .where({ id: input.account.id })
      .forUpdate()
      .first<BankAccountForSync>([
        'id',
        'connection_credential_id',
        'provider_bank_account_id',
        'connection_status',
        'transaction_sync_cursor',
        'initial_transaction_sync_completed_at',
        'last_sync_at',
        'is_deleted',
      ]);
    const streamStateChanged = input.usesDateRangeStrategy
      ? normalizeTimestamp(current?.last_sync_at) !==
          normalizeTimestamp(input.account.last_sync_at) ||
        normalizeTimestamp(current?.initial_transaction_sync_completed_at) !==
          normalizeTimestamp(
            input.account.initial_transaction_sync_completed_at,
          )
      : normalizeCursor(current?.transaction_sync_cursor) !==
        normalizeCursor(input.startingCursor);
    if (
      !current ||
      current.is_deleted ||
      current.connection_status !== 'connected' ||
      current.connection_credential_id !==
        input.account.connection_credential_id ||
      current.provider_bank_account_id !==
        input.account.provider_bank_account_id ||
      streamStateChanged
    ) {
      throw new StaleBankAccountSyncError(input.account.id);
    }

    await applyAddedTransactions(trx, input);
    await applyModifiedTransactions(
      trx,
      input.account.id,
      input.update.modified,
    );
    const earliestRemoved = await applyRemovedTransactions(
      trx,
      input.account.id,
      input.update.removed,
    );

    await trx('bank_accounts')
      .where({ id: input.account.id })
      .update({
        transaction_sync_cursor: input.usesDateRangeStrategy
          ? null
          : input.update.finalCursor,
        last_sync_at: completedAt,
        initial_transaction_sync_completed_at:
          current.initial_transaction_sync_completed_at || completedAt,
        sync_error: null,
        updated_at: completedAt,
      });

    await writeBankSyncFailureResolvedNotifications(trx, {
      clientCompanyId: input.account.company_id,
      bankAccountId: input.account.id,
      stateVersion: completedAt,
    });

    if (earliestRemoved) {
      await scheduleBankBalanceAfterCommit(
        {
          companyId: input.account.company_id,
          bankAccountId: input.account.id,
          recalcFrom: earliestRemoved.toISOString().slice(0, 10),
          triggeredBy: 'sync',
          userId: input.userId,
        },
        trx,
      );
    }
  });
}

async function applyAddedTransactions(
  trx: Knex.Transaction,
  input: Pick<
    ApplyCompleteTransactionUpdateInput,
    'account' | 'credential' | 'update' | 'userId'
  >,
): Promise<void> {
  const transactions = input.update.added.filter(
    (transaction) => !transaction.pending,
  );
  if (transactions.length === 0) return;

  const bankTransactions: BankTransactionInput[] = transactions.map(
    (transaction) => ({
      transaction_date: new Date(transaction.date),
      transaction_at: transaction.txnAt || new Date(transaction.date),
      amount: transaction.amount,
      bank_account_id: input.account.id,
      description: transaction.description ?? null,
      payee: transaction.merchantName ?? null,
      source_payload: transaction.rawData ?? undefined,
      idempotency_key: transaction.transactionId,
      additional_notes: transaction.additionalNotes ?? undefined,
    }),
  );
  const batch: BankTransactionBatchInput = {
    source: 'bank_feed',
    bank_account_id: input.account.id,
    bank_transactions: bankTransactions,
    source_metadata: {},
    connection_credential_id: input.credential.id,
  };

  let result;
  try {
    result = await addNewBankTransactions({
      userId: input.userId,
      companyId: input.account.company_id,
      data: batch,
      trx,
    });
  } catch (error) {
    throw new AccountTransactionApplyError(
      syncErrorMessage(error),
      bankTransactions.length,
    );
  }
  if (!result.success && !result.message.includes('previously imported')) {
    throw new AccountTransactionApplyError(
      result.message || 'Failed to import bank transactions',
      bankTransactions.length,
    );
  }
}

async function applyModifiedTransactions(
  trx: Knex.Transaction,
  bankAccountId: string,
  transactions: ProviderTransaction[],
): Promise<void> {
  for (const transaction of transactions) {
    await trx('bank_transactions')
      .where({
        idempotency_key: transaction.transactionId,
        bank_account_id: bankAccountId,
      })
      .update({
        source_payload: {
          ...transaction.rawData,
          category: transaction.category,
          merchant_name: transaction.merchantName,
          last_modified: new Date().toISOString(),
        },
        updated_at: new Date(),
      });
  }
}

async function applyRemovedTransactions(
  trx: Knex.Transaction,
  bankAccountId: string,
  transactionIds: string[],
): Promise<Date | null> {
  if (transactionIds.length === 0) return null;
  const rows = await trx('bank_transactions')
    .where({ bank_account_id: bankAccountId, is_deleted: false })
    .whereIn('idempotency_key', transactionIds)
    .select('transaction_date');
  await trx('bank_transactions')
    .where({ bank_account_id: bankAccountId, is_deleted: false })
    .whereIn('idempotency_key', transactionIds)
    .update({
      is_deleted: true,
      deleted_at: new Date(),
      deletion_origin: 'provider_sync',
      deletion_reason: 'Removed by bank feed provider',
      updated_at: new Date(),
    });
  if (rows.length === 0) return null;
  return rows.reduce<Date>((earliest, row) => {
    const date = new Date(row.transaction_date);
    return date < earliest ? date : earliest;
  }, new Date(rows[0].transaction_date));
}
