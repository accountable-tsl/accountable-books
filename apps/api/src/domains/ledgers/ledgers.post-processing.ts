import type { Knex } from 'knex';

import { writeGlBalanceRecalcsForBoundsOutbox } from '../balances/gl-balance.outbox.js';
import { writeCloseSignalEvalOutboxForPostedLedgerTxns } from '../reporting/close-readiness/signals/close-signal.outbox.js';
import { writeBankAccountWorkMaterializationIntent } from '../work/work-materialization-intent.js';

import type { BankPostingSource } from '../bankTransactions/bankTransactions.model.js';
import type { LedgerTransactionSource } from './ledgers.types.js';

export type LedgerPostProcessingRecord = {
  id: string;
  transactionSource: LedgerTransactionSource;
  sourceTransactionId: string;
};

function bankTxnIdsByAccount(
  posted: LedgerPostProcessingRecord[],
  bankSources: Map<string, BankPostingSource>,
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const record of posted) {
    if (record.transactionSource !== 'bank_transaction') {
      continue;
    }

    const source = bankSources.get(record.sourceTransactionId);
    if (!source?.bankAccountId) {
      continue;
    }

    const ids = grouped.get(source.bankAccountId) ?? [];
    ids.push(record.sourceTransactionId);
    grouped.set(source.bankAccountId, ids);
  }

  return grouped;
}

/** Record post-ledger follow-ups in the outbox (same transaction as the ledger write). */
export async function enqueueLedgerPostProcessing(
  trx: Knex.Transaction,
  input: {
    companyId: string;
    glRecalcBounds: Map<string, { min: string }>;
    postedLedgerTransactions: LedgerPostProcessingRecord[];
    bankSources: Map<string, BankPostingSource>;
    triggeredBy: 'ledger_entry';
  },
): Promise<void> {
  if (input.glRecalcBounds.size > 0) {
    await writeGlBalanceRecalcsForBoundsOutbox(trx, {
      companyId: input.companyId,
      bounds: input.glRecalcBounds,
      triggeredBy: input.triggeredBy,
    });
  }

  if (input.postedLedgerTransactions.length > 0) {
    await writeCloseSignalEvalOutboxForPostedLedgerTxns(trx, {
      companyId: input.companyId,
      ledgerTransactionIds: input.postedLedgerTransactions.map(
        (record) => record.id,
      ),
      triggeredBy: 'ledger_write',
    });
  }

  for (const [bankAccountId, bankTransactionIds] of bankTxnIdsByAccount(
    input.postedLedgerTransactions,
    input.bankSources,
  )) {
    await writeBankAccountWorkMaterializationIntent(trx, {
      clientCompanyId: input.companyId,
      bankAccountId,
      change: {
        type: 'bank_transactions_posted',
        companyId: input.companyId,
        bankAccountId,
        bankTransactionIds,
      },
    });
  }
}
