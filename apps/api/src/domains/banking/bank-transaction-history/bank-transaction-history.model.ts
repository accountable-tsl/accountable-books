import type { Knex } from 'knex';

import { newBankTransactionHistoryCandidate } from './bank-transaction-history.types.js';

import type {
  BankTransactionHistoryCandidate,
  BankTransactionHistoryImport,
  BankTransactionHistoryImportStatus,
  NewBankTransactionHistoryCandidate,
} from './bank-transaction-history.types.js';

const CANDIDATE_INSERT_CHUNK_SIZE = 500;

/**
 * All functions run inside the caller's transaction and throw on failure so
 * the surrounding apply/promotion unit rolls back as a whole.
 */

export async function createHistoryImport({
  bankAccountFeedId,
  companyId,
  trx,
}: {
  bankAccountFeedId: string;
  companyId: string;
  trx: Knex.Transaction;
}): Promise<void> {
  await trx('bank_transaction_history_imports')
    .insert({
      bank_account_feed_id: bankAccountFeedId,
      company_id: companyId,
      status: 'collecting',
    })
    .onConflict(['bank_account_feed_id'])
    .ignore();
}

export async function getHistoryImportForFeed({
  bankAccountFeedId,
  companyId,
  forUpdate = false,
  trx,
}: {
  bankAccountFeedId: string;
  companyId: string;
  forUpdate?: boolean;
  trx: Knex.Transaction;
}): Promise<BankTransactionHistoryImport | undefined> {
  const query = trx('bank_transaction_history_imports')
    .where({ bank_account_feed_id: bankAccountFeedId, company_id: companyId })
    .first<BankTransactionHistoryImport | undefined>('*');
  if (forUpdate) query.forUpdate();
  return query;
}

export async function upsertHistoryCandidates({
  candidates,
  trx,
}: {
  candidates: NewBankTransactionHistoryCandidate[];
  trx: Knex.Transaction;
}): Promise<void> {
  if (candidates.length === 0) return;

  const rows = candidates.map((candidate) => {
    const parsed = newBankTransactionHistoryCandidate.safeParse(candidate);
    if (!parsed.success) {
      throw new Error('Invalid history candidate input', {
        cause: parsed.error,
      });
    }
    return parsed.data;
  });

  for (
    let offset = 0;
    offset < rows.length;
    offset += CANDIDATE_INSERT_CHUNK_SIZE
  ) {
    const chunk = rows.slice(offset, offset + CANDIDATE_INSERT_CHUNK_SIZE);
    await trx('bank_transaction_history_candidates')
      .insert(chunk.map((row) => ({ ...row, updated_at: trx.fn.now() })))
      .onConflict(['bank_account_feed_id', 'provider_transaction_id'])
      .merge([
        'transaction_date',
        'transaction_at',
        'amount',
        'description',
        'payee',
        'additional_notes',
        'provider_evidence',
        'provider_evidence_schema_version',
        'observed_at',
        'updated_at',
      ]);
  }
}

export async function deleteHistoryCandidates({
  bankAccountFeedId,
  providerTransactionIds,
  trx,
}: {
  bankAccountFeedId: string;
  providerTransactionIds: string[];
  trx: Knex.Transaction;
}): Promise<number> {
  if (providerTransactionIds.length === 0) return 0;
  return trx('bank_transaction_history_candidates')
    .where({ bank_account_feed_id: bankAccountFeedId })
    .whereIn('provider_transaction_id', providerTransactionIds)
    .delete();
}

export async function listCandidatesFromDate({
  bankAccountFeedId,
  companyId,
  fromDate,
  trx,
}: {
  bankAccountFeedId: string;
  companyId: string;
  /** yyyy-MM-dd; candidates dated on/after this date are returned. */
  fromDate: string;
  trx: Knex.Transaction;
}): Promise<BankTransactionHistoryCandidate[]> {
  return trx('bank_transaction_history_candidates')
    .where({ bank_account_feed_id: bankAccountFeedId, company_id: companyId })
    .where('transaction_date', '>=', fromDate)
    .orderBy(['transaction_date', 'transaction_at', 'id'])
    .select<BankTransactionHistoryCandidate[]>('*');
}

export async function getCandidatesByProviderIds({
  bankAccountFeedId,
  providerTransactionIds,
  trx,
}: {
  bankAccountFeedId: string;
  providerTransactionIds: string[];
  trx: Knex.Transaction;
}): Promise<BankTransactionHistoryCandidate[]> {
  if (providerTransactionIds.length === 0) return [];
  return trx('bank_transaction_history_candidates')
    .where({ bank_account_feed_id: bankAccountFeedId })
    .whereIn('provider_transaction_id', providerTransactionIds)
    .select<BankTransactionHistoryCandidate[]>('*');
}

/**
 * Recomputes count/min/max from the candidate rows in one query. Call after
 * any candidate insert, update, or delete.
 */
export async function refreshHistoryImportAggregates({
  bankAccountFeedId,
  trx,
}: {
  bankAccountFeedId: string;
  trx: Knex.Transaction;
}): Promise<void> {
  await trx.raw(
    `
    UPDATE bank_transaction_history_imports AS import
    SET
      transaction_count = aggregates.txn_count,
      earliest_transaction_date = aggregates.earliest,
      latest_transaction_date = aggregates.latest,
      updated_at = now()
    FROM (
      SELECT
        count(*)::int AS txn_count,
        min(transaction_date) AS earliest,
        max(transaction_date) AS latest
      FROM bank_transaction_history_candidates
      WHERE bank_account_feed_id = :feedId
    ) AS aggregates
    WHERE import.bank_account_feed_id = :feedId
    `,
    { feedId: bankAccountFeedId },
  );
}

export async function markHistoryImportStatus({
  bankAccountFeedId,
  companyId,
  status,
  selection,
  onlyIfStatus,
  trx,
}: {
  bankAccountFeedId: string;
  companyId: string;
  status: BankTransactionHistoryImportStatus;
  selection?: { fromDate: string; selectedById: string };
  /**
   * Guard: only transition from this status; already-moved rows are left
   * alone (returns false instead of throwing).
   */
  onlyIfStatus?: BankTransactionHistoryImportStatus;
  trx: Knex.Transaction;
}): Promise<boolean> {
  const patch: Record<string, unknown> = {
    status,
    updated_at: trx.fn.now(),
  };
  if (status === 'selected') {
    if (!selection) {
      throw new Error('Selecting a history import requires selection details');
    }
    patch.selected_from_date = selection.fromDate;
    patch.selected_at = trx.fn.now();
    patch.selected_by_id = selection.selectedById;
  }

  const query = trx('bank_transaction_history_imports').where({
    bank_account_feed_id: bankAccountFeedId,
    company_id: companyId,
  });
  if (onlyIfStatus) query.where({ status: onlyIfStatus });

  const updated = await query.update(patch);
  if (updated === 0 && !onlyIfStatus) {
    throw new Error('History import not found for status update');
  }
  return updated > 0;
}
