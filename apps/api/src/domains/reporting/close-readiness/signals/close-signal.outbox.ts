import type { Knex } from 'knex';

import { OUTBOX_INTENT } from '../../../outbox/intents.js';
import { writeOutbox } from '../../../outbox/outbox.model.js';
import { enqueueCloseSignalEvalInput } from './close-signal-eval.queue.js';
import { syncLedgerTransactionSignals } from './close-signals.sync.js';

import type { EnqueueCloseSignalEvalInput } from './close-signal-eval.queue.js';

function closeSignalEvalScopeKey(
  companyId: string,
  ledgerTransactionId: string,
): string {
  return `${OUTBOX_INTENT.CLOSE_SIGNAL_EVAL_REQUESTED}:${companyId}:${ledgerTransactionId}`;
}

export async function writeCloseSignalEvalOutbox(
  trx: Knex.Transaction,
  input: EnqueueCloseSignalEvalInput,
): Promise<void> {
  const payload = enqueueCloseSignalEvalInput.parse(input);

  await writeOutbox(trx, {
    intentType: OUTBOX_INTENT.CLOSE_SIGNAL_EVAL_REQUESTED,
    scopeKey: closeSignalEvalScopeKey(
      payload.companyId,
      payload.ledgerTransactionId,
    ),
    payload,
  });
}

export async function writeCloseSignalEvalOutboxForPostedLedgerTxns(
  trx: Knex.Transaction,
  input: {
    companyId: string;
    ledgerTransactionIds: string[];
    triggeredBy: 'ledger_write';
  },
): Promise<void> {
  for (const ledgerTransactionId of input.ledgerTransactionIds) {
    await writeCloseSignalEvalOutbox(trx, {
      companyId: input.companyId,
      ledgerTransactionId,
      triggeredBy: input.triggeredBy,
    });
  }
}

export async function handleCloseSignalEvalOutbox(
  payload: unknown,
  trx?: Knex.Transaction,
): Promise<void> {
  const { ledgerTransactionId } = enqueueCloseSignalEvalInput.parse(payload);
  await syncLedgerTransactionSignals(ledgerTransactionId, trx);
}
