import type { Knex } from 'knex';

import { knexClient } from '../../../db/knexClient.js';
import { updateProviderReportedBalance } from '../../../domains/balances/bank-current-balance.js';
import { scheduleBankBalanceAfterCommit } from '../../../domains/balances/index.js';
import {
  advanceFeedCheckpoint,
  assertFeedApplyGuard,
} from '../../../domains/banking/bank-account-feeds/bank-account-feeds.model.js';
import {
  FeedTransactionImportError,
  importFinalizedFeedTransactions,
} from '../../../domains/banking/bank-feed-import/import-feed-transactions.js';
import {
  deleteFeedEntry,
  repointFeedEntryToReplacement,
  upsertFeedEntry,
} from '../../../domains/banking/bank-transaction-feed-entries/bank-transaction-feed-entries.model.js';
import {
  createHistoryImport,
  deleteHistoryCandidates,
  getCandidatesByProviderIds,
  markHistoryImportStatus,
  refreshHistoryImportAggregates,
  upsertHistoryCandidates,
} from '../../../domains/banking/bank-transaction-history/bank-transaction-history.model.js';
import { completeSyncRun } from '../../../domains/banking/bank-transaction-sync-runs/bank-transaction-sync-runs.model.js';
import {
  writeBankReplacementUnmatchedNotifications,
  writeBankSyncFailureResolvedNotifications,
  writeBankTransactionRemovedNotifications,
  writeBankTransactionSupersededNotifications,
  writeHistoryImportAvailableNotifications,
} from '../../../domains/banking/bankAccounts/bankAccountNotifications.js';
import { sanitizeProviderSnapshot } from '../utils/provider-snapshot.js';
import {
  loadPredecessorPool,
  planReplacementMatches,
  toDateYmd,
} from './replacement-reconciliation.js';
import {
  AccountTransactionApplyError,
  StaleBankAccountSyncError,
  syncErrorMessage,
} from './transaction-sync.errors.js';

import type { FinalizedFeedTransaction } from '../../../domains/banking/bank-feed-import/import-feed-transactions.js';
import type {
  ProviderTransaction,
  ProviderTransactionUpdate,
} from '../types/base.js';
import type {
  AppliedTransactionUpdateCounts,
  BankAccountForSync,
} from './transaction-sync.types.js';

interface ApplyCompleteTransactionUpdateInput {
  account: BankAccountForSync;
  syncRunId: string;
  update: ProviderTransactionUpdate;
  startingCheckpoint: string | null;
  userId: string;
}

interface ApplyContext extends ApplyCompleteTransactionUpdateInput {
  /** yyyy-MM-dd accepted starting date, or null when the feed has none. */
  boundaryYmd: string | null;
}

function providerEvidence(
  rawData: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return sanitizeProviderSnapshot(rawData, 'transaction') ?? {};
}

/**
 * Null for unparseable provider dates: routing then falls through to the
 * normal import path, whose date validation owns the failure.
 */
function toYmd(value: Date | string): string | null {
  return toDateYmd(value);
}

function minYmd(left: string | null, right: string): string {
  return left === null || right < left ? right : left;
}

/** Key-order-independent equality for sanitized provider evidence. */
function sameEvidence(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${stableStringify(entryValue)}`,
      );
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function toFinalizedFeedTransaction(
  transaction: ProviderTransaction,
): FinalizedFeedTransaction {
  return {
    providerTransactionId: transaction.transactionId,
    transactionDate: new Date(transaction.date),
    transactionAt: transaction.txnAt || new Date(transaction.date),
    amount: transaction.amount,
    description: transaction.description ?? null,
    payee: transaction.merchantName ?? null,
    additionalNotes: transaction.additionalNotes ?? undefined,
    providerEvidence: providerEvidence(transaction.rawData),
  };
}

export async function applyCompleteTransactionUpdate(
  input: ApplyCompleteTransactionUpdateInput,
): Promise<AppliedTransactionUpdateCounts> {
  return knexClient.transaction(async (trx) => {
    const guardResult = await assertFeedApplyGuard({
      snapshot: {
        feedId: input.account.feed_id,
        bankConnectionId: input.account.bank_connection_id,
        syncCursor: input.startingCheckpoint,
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

    const context: ApplyContext = {
      ...input,
      boundaryYmd: input.account.sync_from_date
        ? toYmd(input.account.sync_from_date)
        : null,
    };

    const observedResult = await applyObservedTransactions(trx, context);
    const removedResult = await applyRemovedTransactionIds(trx, context);

    if (observedResult.candidatesTouched || removedResult.candidatesTouched) {
      await refreshHistoryImportAggregates({
        bankAccountFeedId: input.account.feed_id,
        trx,
      });
    }
    if (input.update.historyStatus !== 'collecting') {
      const becameAvailable =
        input.update.historyStatus === 'complete' &&
        (await markHistoryImportStatus({
          bankAccountFeedId: input.account.feed_id,
          companyId: input.account.company_id,
          status: 'available',
          onlyIfStatus: 'collecting',
          trx,
        }));
      if (input.update.historyStatus !== 'complete') {
        await markHistoryImportStatus({
          bankAccountFeedId: input.account.feed_id,
          companyId: input.account.company_id,
          status: 'unavailable',
          onlyIfStatus: 'collecting',
          trx,
        });
      }
      if (becameAvailable) {
        const historyImport = await trx('bank_transaction_history_imports')
          .where({
            bank_account_feed_id: input.account.feed_id,
            company_id: input.account.company_id,
          })
          .first<{ expires_at: Date | null }>('expires_at');
        const account = await trx('bank_accounts')
          .where({
            id: input.account.bank_account_id,
            company_id: input.account.company_id,
          })
          .first<{ display_name: string }>('display_name');
        if (historyImport?.expires_at && account) {
          await writeHistoryImportAvailableNotifications(trx, {
            clientCompanyId: input.account.company_id,
            bankAccountId: input.account.bank_account_id,
            bankAccountName: account.display_name,
            feedId: input.account.feed_id,
            expiresAt: historyImport.expires_at,
            stateVersion: historyImport.expires_at,
          });
        }
      }
    }

    if (observedResult.unmatchedReplacementCount > 0) {
      const account = await trx('bank_accounts')
        .where({
          id: input.account.bank_account_id,
          company_id: input.account.company_id,
        })
        .first<{ display_name: string }>('display_name');
      if (account) {
        await writeBankReplacementUnmatchedNotifications(trx, {
          clientCompanyId: input.account.company_id,
          bankAccountId: input.account.bank_account_id,
          bankAccountName: account.display_name,
          feedId: input.account.feed_id,
          unmatchedCount: observedResult.unmatchedReplacementCount,
          stateVersion: new Date(),
        });
      }
    }

    // Initial sync completes only when history collection resolves; while
    // still collecting the outbox intent defers and webhooks must keep
    // waking feeds with initial_sync_completed_at IS NULL.
    const markInitialComplete =
      !input.account.initial_sync_completed_at &&
      input.update.historyStatus !== 'collecting';
    const advanceResult = await advanceFeedCheckpoint({
      feedId: input.account.feed_id,
      companyId: input.account.company_id,
      expectedStateVersion: input.account.state_version,
      syncCursor: input.update.nextCheckpoint,
      markInitialComplete,
      trx,
    });
    if (!advanceResult.success) {
      throw new StaleBankAccountSyncError(input.account.bank_account_id);
    }

    if (
      markInitialComplete &&
      input.account.replaces_bank_account_feed_id &&
      !input.account.replacement_reconciliation_completed_at
    ) {
      await trx('bank_account_feeds')
        .where({
          id: input.account.feed_id,
          company_id: input.account.company_id,
        })
        .whereNull('replacement_reconciliation_completed_at')
        .update({
          replacement_reconciliation_completed_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });
    }

    const counts: AppliedTransactionUpdateCounts = {
      added: observedResult.addedCount,
      modified: observedResult.modifiedCount,
      removed: removedResult.removedCount,
    };
    const completedRun = await completeSyncRun({
      syncRunId: input.syncRunId,
      companyId: input.account.company_id,
      outcome: 'succeeded',
      pageCount: input.update.pageCount,
      addedCount: counts.added,
      modifiedCount: counts.modified,
      removedCount: counts.removed,
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

    if (input.update.reportedCurrentBalance) {
      await updateProviderReportedBalance({
        companyId: input.account.company_id,
        bankAccountId: input.account.bank_account_id,
        balance: input.update.reportedCurrentBalance.amount,
        asOf: input.update.reportedCurrentBalance.asOf,
        client: trx,
      });
    }

    const earliestBalanceImpact = [
      observedResult.earliestBalanceImpactYmd,
      removedResult.earliestBalanceImpactYmd,
    ]
      .filter((value): value is string => value !== null)
      .sort()[0];
    if (earliestBalanceImpact) {
      await scheduleBankBalanceAfterCommit(
        {
          companyId: input.account.company_id,
          bankAccountId: input.account.bank_account_id,
          recalcFrom: earliestBalanceImpact,
          triggeredBy: 'sync',
          userId: input.userId,
        },
        trx,
      );
    }

    return counts;
  });
}

interface StoredCanonicalRow {
  id: string;
  amount: string;
  transaction_date: Date;
  ledger_transaction_id: string | null;
  is_deleted: boolean;
  deletion_origin: string | null;
  superseded_by_bank_transaction_id: string | null;
  source_payload: Record<string, unknown>;
}

/**
 * Classifies every observed transaction against what is already stored:
 * unknown → import or quarantine by date; known imported → evidence refresh
 * or supersede routed by the corrected date; known candidate → update in
 * place or move into the imported set. Providers never pre-classify.
 */
async function applyObservedTransactions(
  trx: Knex.Transaction,
  context: ApplyContext,
): Promise<{
  addedCount: number;
  modifiedCount: number;
  candidatesTouched: boolean;
  earliestBalanceImpactYmd: string | null;
  unmatchedReplacementCount: number;
}> {
  // Pending observations are discarded entirely; the transaction is imported
  // once when the provider finalizes it (dedupe by provider id).
  const observed = context.update.observedTransactions.filter(
    (transaction) => !transaction.pending,
  );
  const result = {
    addedCount: 0,
    modifiedCount: 0,
    candidatesTouched: false,
    earliestBalanceImpactYmd: null as string | null,
    unmatchedReplacementCount: 0,
  };
  if (observed.length === 0) return result;

  const providerIds = observed.map((transaction) => transaction.transactionId);
  const entryRows = await trx('bank_transaction_feed_entries')
    .where({ bank_account_feed_id: context.account.feed_id })
    .whereIn('provider_transaction_id', providerIds)
    .select(
      'provider_transaction_id',
      'bank_transaction_id',
      'provider_evidence',
    );
  const entryByProviderId = new Map(
    entryRows.map((row) => [
      row.provider_transaction_id as string,
      {
        bankTransactionId: row.bank_transaction_id as string,
        evidence: row.provider_evidence as Record<string, unknown>,
      },
    ]),
  );
  const candidateRows = await getCandidatesByProviderIds({
    bankAccountFeedId: context.account.feed_id,
    providerTransactionIds: providerIds,
    trx,
  });
  const candidateByProviderId = new Map(
    candidateRows.map((row) => [row.provider_transaction_id, row]),
  );

  const canonicalRows =
    entryRows.length > 0
      ? await trx('bank_transactions')
          .where({ bank_account_id: context.account.bank_account_id })
          .whereIn(
            'id',
            entryRows.map((row) => row.bank_transaction_id as string),
          )
          .select<StoredCanonicalRow[]>(
            'id',
            'amount',
            'transaction_date',
            'ledger_transaction_id',
            'is_deleted',
            'deletion_origin',
            'superseded_by_bank_transaction_id',
            'source_payload',
          )
      : [];
  const canonicalById = new Map(canonicalRows.map((row) => [row.id, row]));

  const newImports: ProviderTransaction[] = [];
  const unmatchedReplacementImports: ProviderTransaction[] = [];
  const candidateWrites: ProviderTransaction[] = [];
  const candidatePromotions: ProviderTransaction[] = [];
  const unknownForReplacement: ProviderTransaction[] = [];
  const shouldReconcileReplacement =
    Boolean(context.account.replaces_bank_account_feed_id) &&
    !context.account.replacement_reconciliation_completed_at;

  for (const transaction of observed) {
    const observedYmd = toYmd(transaction.date);
    const beforeBoundary =
      context.boundaryYmd !== null &&
      observedYmd !== null &&
      observedYmd < context.boundaryYmd;

    const entry = entryByProviderId.get(transaction.transactionId);
    if (entry) {
      const stored = canonicalById.get(entry.bankTransactionId);
      if (!stored) continue;

      // Superseded rows are retired; the live identity is the replacement.
      // Provider-removed rows may reappear and must be restored.
      if (stored.is_deleted) {
        if (stored.superseded_by_bank_transaction_id) continue;
        if (stored.deletion_origin !== 'provider_sync') continue;
        await trx('bank_transactions')
          .where({
            id: stored.id,
            bank_account_id: context.account.bank_account_id,
            is_deleted: true,
          })
          .update({
            is_deleted: false,
            deleted_at: null,
            deletion_origin: null,
            deletion_reason: null,
            updated_at: new Date(),
          });
        stored.is_deleted = false;
        stored.deletion_origin = null;
      }

      const storedYmd = toYmd(stored.transaction_date);
      const financialChange =
        Number(stored.amount).toFixed(4) !== transaction.amount.toFixed(4) ||
        storedYmd !== observedYmd;

      if (!financialChange) {
        // No-op when the enrichment we would write is what is already
        // stored (last_modified excluded — it's our own write timestamp).
        const nextPayload = buildEnrichmentPayload(transaction);
        const { last_modified: _current, ...currentPayload } =
          stored.source_payload;
        if (sameEvidence(currentPayload, nextPayload)) continue;
        await refreshTransactionEvidence(trx, context, transaction, stored.id);
        result.modifiedCount++;
        continue;
      }

      await supersedeTransaction(trx, context, {
        transaction,
        stored,
        beforeBoundary,
      });
      if (beforeBoundary) result.candidatesTouched = true;
      result.modifiedCount++;
      for (const impactYmd of [storedYmd, observedYmd]) {
        if (impactYmd) {
          result.earliestBalanceImpactYmd = minYmd(
            result.earliestBalanceImpactYmd,
            impactYmd,
          );
        }
      }
      continue;
    }

    const candidate = candidateByProviderId.get(transaction.transactionId);
    if (candidate) {
      if (beforeBoundary) {
        candidateWrites.push(transaction); // corrected in place
      } else {
        candidatePromotions.push(transaction); // corrected into the accepted window
      }
      result.candidatesTouched = true;
      result.modifiedCount++;
      continue;
    }

    // Unknown provider id — may adopt from predecessor feed on replacement.
    if (shouldReconcileReplacement && !beforeBoundary) {
      unknownForReplacement.push(transaction);
      continue;
    }

    if (beforeBoundary) {
      candidateWrites.push(transaction);
      result.candidatesTouched = true;
    } else {
      newImports.push(transaction);
    }
    result.addedCount++;
  }

  if (shouldReconcileReplacement && unknownForReplacement.length > 0) {
    const predecessorFeedId = context.account.replaces_bank_account_feed_id!;
    const windowStartYmd = context.account.predecessor_sync_from_date
      ? toYmd(context.account.predecessor_sync_from_date)
      : null;
    const windowEndYmd = context.account.predecessor_last_successful_sync_at
      ? toYmd(context.account.predecessor_last_successful_sync_at)
      : null;

    const pool = await loadPredecessorPool({
      trx,
      predecessorFeedId,
      bankAccountId: context.account.bank_account_id,
      companyId: context.account.company_id,
      windowStartYmd,
      windowEndYmd,
    });
    const plan = planReplacementMatches({
      unknownObservations: unknownForReplacement,
      pool,
      windowStartYmd,
      windowEndYmd,
    });

    const observedAt = new Date();
    for (const { observation, predecessor } of plan.adopts) {
      await upsertFeedEntry({
        data: {
          bank_account_feed_id: context.account.feed_id,
          company_id: context.account.company_id,
          provider_transaction_id: observation.transactionId,
          bank_transaction_id: predecessor.bankTransactionId,
          observation_type: 'added',
          provider_evidence: providerEvidence(observation.rawData),
          provider_evidence_schema_version: 1,
          observed_at: observedAt,
          adopted_from_feed_entry_id: predecessor.feedEntryId,
          replacement_unmatched: false,
        },
        trx,
      });
      result.addedCount++;
      const impactYmd = toYmd(observation.date);
      if (impactYmd) {
        result.earliestBalanceImpactYmd = minYmd(
          result.earliestBalanceImpactYmd,
          impactYmd,
        );
      }
    }

    for (const observation of plan.unmatchedImports) {
      unmatchedReplacementImports.push(observation);
      result.addedCount++;
    }
    for (const observation of plan.passthrough) {
      newImports.push(observation);
      result.addedCount++;
    }
  }

  if (candidatePromotions.length > 0) {
    await deleteHistoryCandidates({
      bankAccountFeedId: context.account.feed_id,
      providerTransactionIds: candidatePromotions.map(
        (transaction) => transaction.transactionId,
      ),
      trx,
    });
  }

  const toImport = [
    ...newImports.map((transaction) => ({
      transaction,
      replacementUnmatched: false,
    })),
    ...unmatchedReplacementImports.map((transaction) => ({
      transaction,
      replacementUnmatched: true,
    })),
    ...candidatePromotions.map((transaction) => ({
      transaction,
      replacementUnmatched: false,
    })),
  ];
  if (toImport.length > 0) {
    try {
      await importFinalizedFeedTransactions(trx, {
        companyId: context.account.company_id,
        userId: context.userId,
        bankAccountId: context.account.bank_account_id,
        feedId: context.account.feed_id,
        syncRunId: context.syncRunId,
        transactions: toImport.map(({ transaction, replacementUnmatched }) => ({
          ...toFinalizedFeedTransaction(transaction),
          replacementUnmatched,
        })),
      });
    } catch (error) {
      if (error instanceof FeedTransactionImportError) {
        throw new AccountTransactionApplyError(
          syncErrorMessage(error),
          error.attemptedCount,
        );
      }
      throw error;
    }
  }

  result.unmatchedReplacementCount = unmatchedReplacementImports.length;

  if (candidateWrites.length > 0) {
    await createHistoryImport({
      bankAccountFeedId: context.account.feed_id,
      companyId: context.account.company_id,
      trx,
    });
    const observedAt = new Date();
    await upsertHistoryCandidates({
      candidates: candidateWrites.map((transaction) => ({
        bank_account_feed_id: context.account.feed_id,
        company_id: context.account.company_id,
        provider_transaction_id: transaction.transactionId,
        transaction_date: new Date(transaction.date),
        transaction_at: transaction.txnAt || new Date(transaction.date),
        amount: transaction.amount,
        description: transaction.description || null,
        payee: transaction.merchantName || null,
        additional_notes: transaction.additionalNotes || null,
        provider_evidence: providerEvidence(transaction.rawData),
        provider_evidence_schema_version: 1,
        observed_at: observedAt,
      })),
      trx,
    });
  }

  return result;
}

function buildEnrichmentPayload(
  transaction: ProviderTransaction,
): Record<string, unknown> {
  return {
    ...providerEvidence(transaction.rawData),
    category: transaction.category,
    merchant_name: transaction.merchantName,
  };
}

/** Enrichment-only change: refresh evidence, never touch user-editable fields. */
async function refreshTransactionEvidence(
  trx: Knex.Transaction,
  context: ApplyContext,
  transaction: ProviderTransaction,
  bankTransactionId: string,
): Promise<void> {
  await trx('bank_transactions')
    .where({
      id: bankTransactionId,
      bank_account_id: context.account.bank_account_id,
    })
    .update({
      source_payload: {
        ...buildEnrichmentPayload(transaction),
        last_modified: new Date().toISOString(),
      },
      updated_at: new Date(),
    });

  await persistFeedEntry({
    data: {
      bank_account_feed_id: context.account.feed_id,
      company_id: context.account.company_id,
      provider_transaction_id: transaction.transactionId,
      bank_transaction_id: bankTransactionId,
      observation_type: 'modified',
      provider_evidence: providerEvidence(transaction.rawData),
      provider_evidence_schema_version: 1,
      observed_at: new Date(),
    },
    trx,
  });
}

/**
 * Material financial correction: retire the stored transaction and route the
 * replacement by its corrected date. The ledger is never touched; a
 * ledger-linked original raises a bookkeeper notification instead.
 */
async function supersedeTransaction(
  trx: Knex.Transaction,
  context: ApplyContext,
  input: {
    transaction: ProviderTransaction;
    stored: StoredCanonicalRow;
    beforeBoundary: boolean;
  },
): Promise<void> {
  const { transaction, stored } = input;

  let replacementId: string | null = null;
  if (!input.beforeBoundary) {
    const imported = await importFinalizedFeedTransactions(trx, {
      companyId: context.account.company_id,
      userId: context.userId,
      bankAccountId: context.account.bank_account_id,
      feedId: context.account.feed_id,
      syncRunId: context.syncRunId,
      fingerprintContext: `supersede:${stored.id}`,
      forceNewCanonical: true,
      writeFeedEntries: false,
      transactions: [toFinalizedFeedTransaction(transaction)],
    });
    replacementId =
      imported.bankTransactionIdByProviderId.get(transaction.transactionId) ??
      null;
    if (!replacementId) {
      throw new Error('Supersede replacement transaction was not created');
    }
  }

  await trx('bank_transactions')
    .where({
      id: stored.id,
      bank_account_id: context.account.bank_account_id,
      is_deleted: false,
    })
    .update({
      is_deleted: true,
      deleted_at: new Date(),
      deletion_origin: 'provider_sync',
      deletion_reason: 'Superseded by provider correction',
      superseded_by_bank_transaction_id: replacementId,
      updated_at: new Date(),
    });

  if (replacementId) {
    await repointFeedEntryToReplacement({
      bankAccountFeedId: context.account.feed_id,
      providerTransactionId: transaction.transactionId,
      fromBankTransactionId: stored.id,
      toBankTransactionId: replacementId,
      trx,
    });
    await persistFeedEntry({
      data: {
        bank_account_feed_id: context.account.feed_id,
        company_id: context.account.company_id,
        provider_transaction_id: transaction.transactionId,
        bank_transaction_id: replacementId,
        observation_type: 'modified',
        provider_evidence: providerEvidence(transaction.rawData),
        provider_evidence_schema_version: 1,
        observed_at: new Date(),
      },
      trx,
    });
  } else {
    // The correction moved the transaction before the accepted starting
    // date: the replacement becomes a history candidate and the mapping
    // (imported finals only) goes away until promotion recreates it.
    await deleteFeedEntry({
      bankAccountFeedId: context.account.feed_id,
      providerTransactionId: transaction.transactionId,
      trx,
    });
    await createHistoryImport({
      bankAccountFeedId: context.account.feed_id,
      companyId: context.account.company_id,
      trx,
    });
    await upsertHistoryCandidates({
      candidates: [
        {
          bank_account_feed_id: context.account.feed_id,
          company_id: context.account.company_id,
          provider_transaction_id: transaction.transactionId,
          transaction_date: new Date(transaction.date),
          transaction_at: transaction.txnAt || new Date(transaction.date),
          amount: transaction.amount,
          description: transaction.description || null,
          payee: transaction.merchantName || null,
          additional_notes: transaction.additionalNotes || null,
          provider_evidence: providerEvidence(transaction.rawData),
          provider_evidence_schema_version: 1,
          observed_at: new Date(),
          supersedes_bank_transaction_id: stored.id,
        },
      ],
      trx,
    });
  }

  if (stored.ledger_transaction_id) {
    await writeBankTransactionSupersededNotifications(trx, {
      clientCompanyId: context.account.company_id,
      bankAccountId: context.account.bank_account_id,
      bankAccountName: await loadBankAccountName(trx, context),
      bankTransactionId: stored.id,
      ledgerTransactionId: stored.ledger_transaction_id,
      replacementBankTransactionId: replacementId,
      stateVersion: new Date(),
    });
  }
}

/**
 * Removal events: soft-delete unlinked imports (kept for audit),
 * keep ledger-linked imports visible and raise a review notification,
 * delete matching candidates. Unknown provider ids are silently ignored
 * (e.g. removals of never-stored pending transactions).
 */
async function applyRemovedTransactionIds(
  trx: Knex.Transaction,
  context: ApplyContext,
): Promise<{
  removedCount: number;
  candidatesTouched: boolean;
  earliestBalanceImpactYmd: string | null;
}> {
  const removedIds = context.update.removedTransactionIds;
  const result = {
    removedCount: 0,
    candidatesTouched: false,
    earliestBalanceImpactYmd: null as string | null,
  };
  if (removedIds.length === 0) return result;

  const entries = await trx('bank_transaction_feed_entries as entry')
    .join('bank_transactions as transaction', {
      'transaction.id': 'entry.bank_transaction_id',
      'transaction.company_id': 'entry.company_id',
    })
    .where({
      'entry.bank_account_feed_id': context.account.feed_id,
      'transaction.bank_account_id': context.account.bank_account_id,
      'transaction.is_deleted': false,
    })
    .whereIn('entry.provider_transaction_id', removedIds)
    .select(
      'entry.provider_transaction_id',
      'transaction.id as bank_transaction_id',
      'transaction.transaction_date',
      'transaction.ledger_transaction_id',
    );

  const observedAt = new Date();
  for (const entry of entries) {
    const bankTransactionId = entry.bank_transaction_id as string;
    const ledgerTransactionId = entry.ledger_transaction_id as string | null;

    if (ledgerTransactionId) {
      await writeBankTransactionRemovedNotifications(trx, {
        clientCompanyId: context.account.company_id,
        bankAccountId: context.account.bank_account_id,
        bankAccountName: await loadBankAccountName(trx, context),
        bankTransactionId,
        ledgerTransactionId,
        stateVersion: observedAt,
      });
    } else {
      await trx('bank_transactions')
        .where({
          id: bankTransactionId,
          bank_account_id: context.account.bank_account_id,
          is_deleted: false,
        })
        .update({
          is_deleted: true,
          deleted_at: observedAt,
          deletion_origin: 'provider_sync',
          deletion_reason: 'Removed by bank feed provider',
          updated_at: observedAt,
        });
      const removedYmd = toYmd(entry.transaction_date as Date);
      if (removedYmd) {
        result.earliestBalanceImpactYmd = minYmd(
          result.earliestBalanceImpactYmd,
          removedYmd,
        );
      }
    }

    await persistFeedEntry({
      data: {
        bank_account_feed_id: context.account.feed_id,
        company_id: context.account.company_id,
        provider_transaction_id: entry.provider_transaction_id as string,
        bank_transaction_id: bankTransactionId,
        observation_type: 'removed',
        provider_evidence: {
          transactionId: entry.provider_transaction_id,
        },
        provider_evidence_schema_version: 1,
        observed_at: observedAt,
      },
      trx,
    });
    result.removedCount++;
  }

  const deletedCandidates = await deleteHistoryCandidates({
    bankAccountFeedId: context.account.feed_id,
    providerTransactionIds: removedIds,
    trx,
  });
  if (deletedCandidates > 0) {
    result.candidatesTouched = true;
    result.removedCount += deletedCandidates;
  }

  return result;
}

async function loadBankAccountName(
  trx: Knex.Transaction,
  context: ApplyContext,
): Promise<string> {
  const row = await trx('bank_accounts')
    .where({ id: context.account.bank_account_id })
    .first<{ display_name: string }>('display_name');
  return row?.display_name ?? 'bank account';
}

async function persistFeedEntry(
  input: Parameters<typeof upsertFeedEntry>[0],
): Promise<void> {
  const result = await upsertFeedEntry(input);
  if (!result.success) {
    throw new Error(result.message || 'Failed to persist bank feed evidence');
  }
}
