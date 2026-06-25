import type { Knex } from 'knex';

import { knexClient as db } from '../../../../db/knexClient.js';
import { evaluateLedgerTransactionSignals } from './close-signals.evaluator.js';
import { loadLedgerTransactionForSignals } from './close-signals.loader.js';

import type {
  CloseReviewSignalInput,
  SignalLedgerTransaction,
} from './close-signals.types.js';

const SIGNALS_TABLE = 'close_review_signals';

export type SyncLedgerTransactionSignalsResult = {
  persisted: number;
  removed: number;
};

/**
 * Reconcile the persisted close review signals for one ledger transaction to
 * match the current evaluation: delete rows that no longer fire, upsert the ones
 * that do. Scoped to a single ledger transaction so there are no cross-row
 * races (the queue also dedups by transaction id).
 *
 * When the transaction is missing, not posted (e.g. superseded), or has no
 * fiscal period, the loader returns null and all of its signals are removed.
 */
export async function syncLedgerTransactionSignals(
  ledgerTransactionId: string,
  trx?: Knex.Transaction,
): Promise<SyncLedgerTransactionSignalsResult> {
  if (trx) return reconcile(trx, ledgerTransactionId);
  return db.transaction((txn) => reconcile(txn, ledgerTransactionId));
}

async function reconcile(
  txn: Knex.Transaction,
  ledgerTransactionId: string,
): Promise<SyncLedgerTransactionSignalsResult> {
  const loaded = await loadLedgerTransactionForSignals(
    ledgerTransactionId,
    txn,
  );
  const signals: CloseReviewSignalInput[] = loaded
    ? evaluateLedgerTransactionSignals(loaded.txn, loaded.entries, {
        accountingBasis: loaded.accountingBasis,
      })
    : [];

  const removed = await deleteVanishedSignals(
    txn,
    ledgerTransactionId,
    signals.map((signal) => signal.fingerprint),
  );

  let persisted = 0;
  if (loaded && signals.length > 0) {
    const rows = signals.map((signal) => toSignalRow(signal, loaded.txn));
    await txn(SIGNALS_TABLE)
      .insert(rows)
      .onConflict('fingerprint')
      // facts can change under a stable identity; the update trigger bumps
      // updated_at. coa/entry are part of the fingerprint, so they never change.
      .merge(['facts_hash', 'details', 'amount']);
    persisted = rows.length;
  }

  return { persisted, removed };
}

async function deleteVanishedSignals(
  txn: Knex.Transaction,
  ledgerTransactionId: string,
  firedFingerprints: string[],
): Promise<number> {
  const query = txn(SIGNALS_TABLE).where(
    'ledger_transaction_id',
    ledgerTransactionId,
  );
  if (firedFingerprints.length > 0) {
    query.whereNotIn('fingerprint', firedFingerprints);
  }
  return query.del();
}

function toSignalRow(
  signal: CloseReviewSignalInput,
  txn: SignalLedgerTransaction,
): Record<string, unknown> {
  return {
    company_id: txn.companyId,
    ledger_transaction_id: signal.ledgerTransactionId,
    ledger_entry_id: signal.ledgerEntryId,
    fiscal_calendar_id: txn.fiscalCalendarId,
    code: signal.code,
    coa_id: signal.coaId,
    account_type_key: signal.accountTypeKey,
    account_element_key: signal.accountElementKey,
    amount: signal.amount,
    fingerprint: signal.fingerprint,
    facts_hash: signal.factsHash,
    details: JSON.stringify(signal.details),
  };
}
