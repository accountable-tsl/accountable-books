import type { AccountingBasis } from '@accountable-books/contracts/schema';
import type { Knex } from 'knex';

import type { AccountElementKey } from '../../../../bootstrap/catalogs/accounting/account-elements.js';
import { knexClient as db } from '../../../../db/knexClient.js';
import { getLogger } from '../../../../shared/utils/logger.js';
import { getFiscalPeriodForDate } from '../../fiscal-calendar/fiscal-calendar.service.js';
import type {
  LedgerCategorizationSource,
  LedgerTransactionSource,
  SignalLedgerEntry,
  SignalLedgerTransaction,
} from './close-signals.types.js';

export type LoadedLedgerTransactionForSignals = {
  txn: SignalLedgerTransaction;
  entries: SignalLedgerEntry[];
  accountingBasis: AccountingBasis;
};

const logger = getLogger({ component: 'close-signals-loader' });

type LedgerTransactionHeaderRow = {
  id: string;
  company_id: string;
  accounting_basis: AccountingBasis;
  transaction_date: string;
  transaction_source: LedgerTransactionSource;
  categorization_source: LedgerCategorizationSource;
  source_transaction_id: string | null;
  contact_id: string | null;
  status: string;
};

type LedgerEntryRow = {
  id: string;
  coa_id: string;
  account_type_key: string;
  // Sourced from account_elements.key, which is constrained to AccountElementKey.
  account_element_key: AccountElementKey;
  label_role: SignalLedgerEntry['labelRole'];
  is_bank_leg: boolean;
  is_monetary: boolean;
  human_reviewed: boolean;
  contact_id: string | null;
  source_amount: string | number;
};

/**
 * Load a posted ledger transaction and its entries in the shape the pure signal
 * evaluator consumes. Returns null when the transaction is missing, not posted,
 * or its date does not resolve to a fiscal period (a signal cannot be placed in
 * a period it has no row for).
 *
 * Grain assumption (V1): signals are computed at MONTHLY grain. The fiscal
 * period is always resolved with `periodType: 'monthly'`, and quarterly/yearly
 * close consumes the monthly rollups rather than recomputing signals at a
 * coarser grain. If every company is monthly at launch, the missing-period
 * branch below never fires; the warn log exists so a broken assumption is
 * visible rather than silently dropping the transaction's signals.
 *
 * This is the DB → evaluator boundary; everything the evaluator needs about
 * account taxonomy, FX/monetary state, categorization quality, counterparty,
 * and supporting documents is resolved here so the evaluator stays pure.
 */
export async function loadLedgerTransactionForSignals(
  ledgerTransactionId: string,
  trx?: Knex.Transaction,
): Promise<LoadedLedgerTransactionForSignals | null> {
  const queryable = trx ?? db;

  const header = await queryable('ledger_transactions as lt')
    .join('companies as co', 'co.id', 'lt.company_id')
    .where('lt.id', ledgerTransactionId)
    .select(
      'lt.id',
      'lt.company_id',
      'co.accounting_basis',
      queryable.raw('lt.transaction_date::text as transaction_date'),
      'lt.transaction_source',
      'lt.categorization_source',
      'lt.source_transaction_id',
      'lt.contact_id',
      'lt.status',
    )
    .first<LedgerTransactionHeaderRow>();

  if (!header || header.status !== 'posted') return null;

  const period = await getFiscalPeriodForDate({
    companyId: header.company_id,
    date: header.transaction_date,
    periodType: 'monthly',
    trx,
  });
  if (!period) {
    // Signals are computed at monthly grain; a posted transaction whose date
    // resolves to no monthly period means the company's monthly calendar has a
    // gap. Drop the signals (we have nowhere to place them) but make it visible.
    logger.warn(
      {
        companyId: header.company_id,
        ledgerTransactionId: header.id,
        transactionDate: header.transaction_date,
      },
      'No monthly fiscal period for posted transaction; skipping close review signals',
    );
    return null;
  }

  const [entryRows, hasSupportingDocument] = await Promise.all([
    loadEntries(queryable, header.company_id, ledgerTransactionId),
    hasSupportingDocumentFor(queryable, header),
  ]);

  const txn: SignalLedgerTransaction = {
    ledgerTransactionId: header.id,
    companyId: header.company_id,
    fiscalYear: period.fiscal_year,
    periodNumber: period.period_number,
    periodType: period.period_type,
    transactionSource: header.transaction_source,
    categorizationSource: header.categorization_source,
    hasSupportingDocument,
  };

  const entries: SignalLedgerEntry[] = entryRows.map((row) => ({
    ledgerEntryId: row.id,
    coaId: row.coa_id,
    accountTypeKey: row.account_type_key,
    accountElementKey: row.account_element_key,
    labelRole: row.label_role,
    isBankLeg: row.is_bank_leg,
    isMonetary: row.is_monetary,
    humanReviewed: row.human_reviewed,
    // Effective counterparty: the leg's own contact, falling back to the
    // transaction-level contact.
    contactId: row.contact_id ?? header.contact_id,
    amount: Number(row.source_amount),
  }));

  return { txn, entries, accountingBasis: header.accounting_basis };
}

function loadEntries(
  queryable: Knex,
  companyId: string,
  ledgerTransactionId: string,
): Promise<LedgerEntryRow[]> {
  return queryable('ledger_entries as le')
    .join('coa as c', function () {
      this.on('c.id', 'le.coa_id').andOn('c.company_id', 'le.company_id');
    })
    .join('account_types as at', 'at.id', 'c.account_type_id')
    .join('account_elements as ae', 'ae.id', 'at.account_element_id')
    .where('le.company_id', companyId)
    .where('le.ledger_transaction_id', ledgerTransactionId)
    .select(
      'le.id',
      'le.coa_id',
      'at.key as account_type_key',
      'ae.key as account_element_key',
      'at.label_role',
      'le.is_bank_leg',
      'le.is_monetary',
      'le.human_reviewed',
      'le.contact_id',
      'le.source_amount',
    );
}

/**
 * A supporting document can be attached directly to the ledger transaction or to
 * its originating journal/bank record (the source_transaction_id), so both ids
 * count. Transaction ids are UUIDs that do not collide across sources.
 */
async function hasSupportingDocumentFor(
  queryable: Knex,
  header: LedgerTransactionHeaderRow,
): Promise<boolean> {
  const transactionIds = [header.id];
  if (header.source_transaction_id) {
    transactionIds.push(header.source_transaction_id);
  }

  const row = await queryable('file_attachments')
    .whereIn('transaction_id', transactionIds)
    .where('is_deleted', false)
    .first('id');

  return Boolean(row);
}
