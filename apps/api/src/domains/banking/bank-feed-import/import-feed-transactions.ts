import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';

import { addNewBankTransactions } from '../../bankTransactions/bankTransactions.model.js';
import { upsertFeedEntry } from '../bank-transaction-feed-entries/bank-transaction-feed-entries.model.js';

import type {
  BankTransactionBatchInput,
  BankTransactionInput,
} from '../../bankTransactions/bankTransactions.types.js';

/**
 * The one canonical way a finalized provider transaction becomes a
 * bank_transaction. Both the sync applier and history promotion go through
 * here: provider-id dedupe against feed entries, batch + transaction insert
 * via addNewBankTransactions (which schedules balance recalc, enrichment,
 * work materialization, and activity intents), then 'added' feed entries.
 */

export interface FinalizedFeedTransaction {
  providerTransactionId: string;
  transactionDate: Date;
  transactionAt: Date;
  amount: number;
  description?: string | null;
  payee?: string | null;
  additionalNotes?: string | null;
  /** Sanitized provider observation (see sanitizeProviderSnapshot). */
  providerEvidence: Record<string, unknown>;
}

export class FeedTransactionImportError extends Error {
  constructor(
    message: string,
    public readonly attemptedCount: number,
  ) {
    super(message);
    this.name = 'FeedTransactionImportError';
  }
}

export async function importFinalizedFeedTransactions(
  trx: Knex.Transaction,
  input: {
    companyId: string;
    userId: string;
    bankAccountId: string;
    feedId: string;
    syncRunId: string | null;
    /**
     * Extra salt for the batch fingerprint. Supersede and promotion pass
     * distinct contexts so a re-import of the same provider ids (e.g. an
     * A→B→A correction flip-flop) never collides with an earlier batch.
     */
    fingerprintContext?: string;
    /**
     * Skip the provider-id dedupe and always create fresh canonical
     * transactions. Only the supersede path uses this: the provider id is
     * still linked to the transaction being retired, and the caller re-points
     * the feed entry afterwards.
     */
    forceNewCanonical?: boolean;
    /**
     * When false the caller owns the feed-entry writes (supersede re-points
     * an existing entry instead of upserting an 'added' observation).
     */
    writeFeedEntries?: boolean;
    transactions: FinalizedFeedTransaction[];
  },
): Promise<{
  importedCount: number;
  bankTransactionIdByProviderId: Map<string, string>;
}> {
  const writeFeedEntries = input.writeFeedEntries ?? true;
  if (input.transactions.length === 0) {
    return { importedCount: 0, bankTransactionIdByProviderId: new Map() };
  }

  const linkedTransactionIdByProviderId = new Map<string, string>();
  if (!input.forceNewCanonical) {
    const linkedRows = await trx('bank_transaction_feed_entries')
      .where({ bank_account_feed_id: input.feedId })
      .whereIn(
        'provider_transaction_id',
        input.transactions.map(
          (transaction) => transaction.providerTransactionId,
        ),
      )
      .select('provider_transaction_id', 'bank_transaction_id');
    for (const row of linkedRows) {
      linkedTransactionIdByProviderId.set(
        row.provider_transaction_id as string,
        row.bank_transaction_id as string,
      );
    }
  }

  const transactionsToCreate = input.transactions.filter(
    (transaction) =>
      !linkedTransactionIdByProviderId.has(transaction.providerTransactionId),
  );
  const newCanonicalIdByProviderId = new Map(
    transactionsToCreate.map((transaction) => [
      transaction.providerTransactionId,
      randomUUID(),
    ]),
  );

  if (transactionsToCreate.length > 0) {
    const bankTransactions: BankTransactionInput[] = transactionsToCreate.map(
      (transaction) => ({
        transaction_date: transaction.transactionDate,
        transaction_at: transaction.transactionAt,
        amount: transaction.amount,
        bank_account_id: input.bankAccountId,
        description: transaction.description ?? null,
        payee: transaction.payee ?? null,
        source_payload: transaction.providerEvidence,
        additional_notes: transaction.additionalNotes ?? undefined,
      }),
    );
    const batch: BankTransactionBatchInput = {
      source: 'bank_feed',
      bank_account_id: input.bankAccountId,
      bank_transactions: bankTransactions,
      source_metadata: {},
      bank_account_feed_id: input.feedId,
      bank_transaction_sync_run_id: input.syncRunId,
    };

    let result;
    try {
      result = await addNewBankTransactions({
        userId: input.userId,
        companyId: input.companyId,
        data: batch,
        batchFingerprintSalt: [
          input.feedId,
          ...transactionsToCreate
            .map((transaction) => transaction.providerTransactionId)
            .sort(),
          ...(input.fingerprintContext ? [input.fingerprintContext] : []),
        ].join(':'),
        canonicalTransactionIds: transactionsToCreate.map(
          (transaction) =>
            newCanonicalIdByProviderId.get(transaction.providerTransactionId)!,
        ),
        trx,
      });
    } catch (error) {
      throw new FeedTransactionImportError(
        error instanceof Error ? error.message : String(error),
        bankTransactions.length,
      );
    }
    if (!result.success) {
      throw new FeedTransactionImportError(
        result.message || 'Failed to import bank transactions',
        bankTransactions.length,
      );
    }
  }

  const bankTransactionIdByProviderId = new Map<string, string>();
  const observedAt = new Date();
  for (const transaction of input.transactions) {
    const bankTransactionId =
      linkedTransactionIdByProviderId.get(transaction.providerTransactionId) ??
      newCanonicalIdByProviderId.get(transaction.providerTransactionId);
    if (!bankTransactionId) {
      throw new Error('Canonical transaction id missing for feed observation');
    }
    bankTransactionIdByProviderId.set(
      transaction.providerTransactionId,
      bankTransactionId,
    );

    if (writeFeedEntries) {
      const entryResult = await upsertFeedEntry({
        data: {
          bank_account_feed_id: input.feedId,
          company_id: input.companyId,
          provider_transaction_id: transaction.providerTransactionId,
          bank_transaction_id: bankTransactionId,
          observation_type: 'added',
          provider_evidence: transaction.providerEvidence,
          provider_evidence_schema_version: 1,
          observed_at: observedAt,
        },
        trx,
      });
      if (!entryResult.success) {
        throw new Error(
          entryResult.message || 'Failed to persist bank feed evidence',
        );
      }
    }
  }

  return {
    importedCount: transactionsToCreate.length,
    bankTransactionIdByProviderId,
  };
}
