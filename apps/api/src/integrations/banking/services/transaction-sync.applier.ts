import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';

import { knexClient } from '../../../db/knexClient.js';
import { scheduleBankBalanceAfterCommit } from '../../../domains/balances/index.js';
import {
  advanceFeedCheckpoint,
  assertFeedApplyGuard,
} from '../../../domains/banking/bank-account-feeds/bank-account-feeds.model.js';
import { upsertFeedEntry } from '../../../domains/banking/bank-transaction-feed-entries/bank-transaction-feed-entries.model.js';
import { completeSyncRun } from '../../../domains/banking/bank-transaction-sync-runs/bank-transaction-sync-runs.model.js';
import { writeBankSyncFailureResolvedNotifications } from '../../../domains/banking/bankAccounts/bankAccountNotifications.js';
import { addNewBankTransactions } from '../../../domains/bankTransactions/bankTransactions.model.js';
import { sanitizeProviderSnapshot } from '../utils/provider-snapshot.js';
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
} from './transaction-sync.types.js';

interface ApplyCompleteTransactionUpdateInput {
  account: BankAccountForSync;
  syncRunId: string;
  update: CompleteTransactionUpdate;
  startingCursor?: string;
  usesDateRangeStrategy: boolean;
  initialSyncFromDate?: Date;
  userId: string;
}

function providerEvidence(
  rawData: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return sanitizeProviderSnapshot(rawData, 'transaction') ?? {};
}

export async function applyCompleteTransactionUpdate(
  input: ApplyCompleteTransactionUpdateInput,
): Promise<void> {
  await knexClient.transaction(async (trx) => {
    const guardResult = await assertFeedApplyGuard({
      snapshot: {
        feedId: input.account.feed_id,
        bankConnectionId: input.account.bank_connection_id,
        syncCursor: input.usesDateRangeStrategy
          ? null
          : (input.startingCursor ?? null),
        syncFromDate: input.account.sync_from_date,
        lastSuccessfulSyncAt: input.account.last_successful_sync_at,
        providerAccountId: input.account.provider_account_id,
        stateVersion: input.account.state_version,
      },
      companyId: input.account.company_id,
      trx,
    });
    if (!guardResult.success || !guardResult.data) {
      throw new StaleBankAccountSyncError(input.account.bank_account_id);
    }

    await applyAddedTransactions(trx, input);
    await applyModifiedTransactions(trx, input);
    const earliestRemoved = await applyRemovedTransactions(trx, input);

    const advanceResult = await advanceFeedCheckpoint({
      feedId: input.account.feed_id,
      companyId: input.account.company_id,
      expectedStateVersion: input.account.state_version,
      syncCursor: input.usesDateRangeStrategy
        ? null
        : (input.update.finalCursor ?? null),
      markInitialComplete: !input.account.initial_sync_completed_at,
      initialSyncFromDate: input.initialSyncFromDate,
      trx,
    });
    if (!advanceResult.success) {
      throw new StaleBankAccountSyncError(input.account.bank_account_id);
    }

    const completedRun = await completeSyncRun({
      syncRunId: input.syncRunId,
      companyId: input.account.company_id,
      outcome: 'succeeded',
      pageCount: input.update.pageCount,
      addedCount: input.update.added.length,
      modifiedCount: input.update.modified.length,
      removedCount: input.update.removed.length,
      trx,
    });
    if (!completedRun.success) {
      throw new Error(
        completedRun.message || 'Failed to complete transaction sync run',
      );
    }

    await writeBankSyncFailureResolvedNotifications(trx, {
      clientCompanyId: input.account.company_id,
      bankAccountId: input.account.bank_account_id,
      stateVersion: new Date(),
    });

    if (earliestRemoved) {
      await scheduleBankBalanceAfterCommit(
        {
          companyId: input.account.company_id,
          bankAccountId: input.account.bank_account_id,
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
  input: ApplyCompleteTransactionUpdateInput,
): Promise<void> {
  const added = input.update.added;
  if (added.length === 0) return;

  // Pending provider observations are retained as feed evidence but must not
  // create canonical bank transactions until the provider posts them.
  const pending = added.filter((transaction) => transaction.pending);
  const posted = added.filter((transaction) => !transaction.pending);

  if (pending.length > 0) {
    await recordPendingFeedEntries(trx, input, pending);
  }

  if (posted.length === 0) return;

  const providerTransactionIds = posted.map(
    (transaction) => transaction.transactionId,
  );
  const linkedRows = await trx('bank_transaction_feed_entries')
    .where({ bank_account_feed_id: input.account.feed_id })
    .whereIn('provider_transaction_id', providerTransactionIds)
    .whereNotNull('bank_transaction_id')
    .select('provider_transaction_id', 'bank_transaction_id');
  const linkedTransactionIdByProviderId = new Map<string, string>(
    linkedRows.map((row) => [
      row.provider_transaction_id as string,
      row.bank_transaction_id as string,
    ]),
  );
  const transactionsToCreate = posted.filter(
    (transaction) =>
      !linkedTransactionIdByProviderId.has(transaction.transactionId),
  );
  const newCanonicalIdByProviderId = new Map(
    transactionsToCreate.map((transaction) => [
      transaction.transactionId,
      randomUUID(),
    ]),
  );

  const bankTransactions: BankTransactionInput[] = transactionsToCreate.map(
    (transaction) => ({
      transaction_date: new Date(transaction.date),
      transaction_at: transaction.txnAt || new Date(transaction.date),
      amount: transaction.amount,
      bank_account_id: input.account.bank_account_id,
      description: transaction.description ?? null,
      payee: transaction.merchantName ?? null,
      source_payload: providerEvidence(transaction.rawData),
      additional_notes: transaction.additionalNotes ?? undefined,
    }),
  );
  const batch: BankTransactionBatchInput = {
    source: 'bank_feed',
    bank_account_id: input.account.bank_account_id,
    bank_transactions: bankTransactions,
    source_metadata: {},
    bank_account_feed_id: input.account.feed_id,
    bank_transaction_sync_run_id: input.syncRunId,
  };

  if (bankTransactions.length > 0) {
    let result;
    try {
      result = await addNewBankTransactions({
        userId: input.userId,
        companyId: input.account.company_id,
        data: batch,
        batchFingerprintSalt: [
          input.account.feed_id,
          ...transactionsToCreate
            .map((transaction) => transaction.transactionId)
            .sort(),
        ].join(':'),
        canonicalTransactionIds: transactionsToCreate.map(
          (transaction) =>
            newCanonicalIdByProviderId.get(transaction.transactionId)!,
        ),
        trx,
      });
    } catch (error) {
      throw new AccountTransactionApplyError(
        syncErrorMessage(error),
        bankTransactions.length,
      );
    }
    if (!result.success) {
      throw new AccountTransactionApplyError(
        result.message || 'Failed to import bank transactions',
        bankTransactions.length,
      );
    }
  }

  const observedAt = new Date();
  for (const transaction of posted) {
    const bankTransactionId =
      linkedTransactionIdByProviderId.get(transaction.transactionId) ??
      newCanonicalIdByProviderId.get(transaction.transactionId);
    if (!bankTransactionId) {
      throw new Error('Canonical transaction id missing for feed observation');
    }
    await persistFeedEntry({
      data: {
        bank_account_feed_id: input.account.feed_id,
        company_id: input.account.company_id,
        provider_transaction_id: transaction.transactionId,
        bank_transaction_id: bankTransactionId,
        observation_type: 'added',
        resolution_state: 'resolved',
        provider_evidence: providerEvidence(transaction.rawData),
        provider_evidence_schema_version: 1,
        observed_at: observedAt,
      },
      trx,
    });
  }
}

async function applyModifiedTransactions(
  trx: Knex.Transaction,
  input: ApplyCompleteTransactionUpdateInput,
): Promise<void> {
  const transactions = input.update.modified;
  if (transactions.length === 0) return;

  const transactionIds = transactions.map(
    (transaction) => transaction.transactionId,
  );
  const rows = await trx('bank_transaction_feed_entries')
    .where({ bank_account_feed_id: input.account.feed_id })
    .whereIn('provider_transaction_id', transactionIds)
    .whereNotNull('bank_transaction_id')
    .select('provider_transaction_id', 'bank_transaction_id');
  const bankTransactionIdByKey = new Map(
    rows.map((row) => [
      row.provider_transaction_id as string,
      row.bank_transaction_id as string,
    ]),
  );

  for (const transaction of transactions) {
    const bankTransactionId = bankTransactionIdByKey.get(
      transaction.transactionId,
    );
    if (bankTransactionId) {
      await trx('bank_transactions')
        .where({
          id: bankTransactionId,
          bank_account_id: input.account.bank_account_id,
        })
        .update({
          source_payload: {
            ...providerEvidence(transaction.rawData),
            category: transaction.category,
            merchant_name: transaction.merchantName,
            last_modified: new Date().toISOString(),
          },
          updated_at: new Date(),
        });
    }
    await persistFeedEntry({
      data: {
        bank_account_feed_id: input.account.feed_id,
        company_id: input.account.company_id,
        provider_transaction_id: transaction.transactionId,
        bank_transaction_id: bankTransactionId ?? null,
        observation_type: 'modified',
        resolution_state: bankTransactionId ? 'resolved' : 'unresolved',
        resolution_reason: bankTransactionId
          ? null
          : 'modified_without_canonical_transaction',
        provider_evidence: providerEvidence(transaction.rawData),
        provider_evidence_schema_version: 1,
        observed_at: new Date(),
      },
      trx,
    });
  }
}

async function applyRemovedTransactions(
  trx: Knex.Transaction,
  input: ApplyCompleteTransactionUpdateInput,
): Promise<Date | null> {
  const transactionIds = input.update.removed;
  if (transactionIds.length === 0) return null;
  const entries = await trx('bank_transaction_feed_entries as entry')
    .join('bank_transactions as transaction', {
      'transaction.id': 'entry.bank_transaction_id',
      'transaction.company_id': 'entry.company_id',
    })
    .where({
      'entry.bank_account_feed_id': input.account.feed_id,
      'transaction.bank_account_id': input.account.bank_account_id,
      'transaction.is_deleted': false,
    })
    .whereIn('entry.provider_transaction_id', transactionIds)
    .select(
      'entry.provider_transaction_id',
      'transaction.id as bank_transaction_id',
      'transaction.transaction_date',
    );
  const canonicalIds = entries.map((entry) => entry.bank_transaction_id);
  if (canonicalIds.length > 0) {
    await trx('bank_transactions')
      .where({
        bank_account_id: input.account.bank_account_id,
        is_deleted: false,
      })
      .whereIn('id', canonicalIds)
      .update({
        is_deleted: true,
        deleted_at: new Date(),
        deletion_origin: 'provider_sync',
        deletion_reason: 'Removed by bank feed provider',
        updated_at: new Date(),
      });
  }

  const bankTransactionIdByKey = new Map(
    entries.map((row) => [
      row.provider_transaction_id as string,
      row.bank_transaction_id as string,
    ]),
  );
  const observedAt = new Date();
  for (const transactionId of transactionIds) {
    await persistFeedEntry({
      data: {
        bank_account_feed_id: input.account.feed_id,
        company_id: input.account.company_id,
        provider_transaction_id: transactionId,
        bank_transaction_id: bankTransactionIdByKey.get(transactionId) ?? null,
        observation_type: 'removed',
        resolution_state: bankTransactionIdByKey.has(transactionId)
          ? 'resolved'
          : 'unresolved',
        resolution_reason: bankTransactionIdByKey.has(transactionId)
          ? null
          : 'removed_without_canonical_transaction',
        provider_evidence: { transactionId },
        provider_evidence_schema_version: 1,
        observed_at: observedAt,
      },
      trx,
    });
  }

  if (entries.length === 0) return null;
  return entries.reduce<Date>((earliest, row) => {
    const date = new Date(row.transaction_date);
    return date < earliest ? date : earliest;
  }, new Date(entries[0].transaction_date));
}

async function recordPendingFeedEntries(
  trx: Knex.Transaction,
  input: ApplyCompleteTransactionUpdateInput,
  transactions: ProviderTransaction[],
): Promise<void> {
  const observedAt = new Date();
  for (const transaction of transactions) {
    await persistFeedEntry({
      data: {
        bank_account_feed_id: input.account.feed_id,
        company_id: input.account.company_id,
        provider_transaction_id: transaction.transactionId,
        bank_transaction_id: null,
        observation_type: 'pending',
        resolution_state: 'awaiting_posted',
        resolution_reason: 'provider_pending',
        provider_evidence: providerEvidence(transaction.rawData),
        provider_evidence_schema_version: 1,
        observed_at: observedAt,
      },
      trx,
    });
  }
}

async function persistFeedEntry(
  input: Parameters<typeof upsertFeedEntry>[0],
): Promise<void> {
  const result = await upsertFeedEntry(input);
  if (!result.success) {
    throw new Error(result.message || 'Failed to persist bank feed evidence');
  }
}
