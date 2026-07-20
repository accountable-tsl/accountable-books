import type { Knex } from 'knex';

import { OUTBOX_INTENT } from '../outbox/intents.js';
import { writeOutbox } from '../outbox/outbox.model.js';
import {
  enqueueGLBalanceInput,
  mergeBalanceRecalcRanges,
} from './balance-recalc.queue.js';
import { glBalanceService } from './gl-balance.service.js';

import type { EnqueueGLBalanceInput } from './balance-recalc.queue.js';

function makeGlBalanceRecalcScopeKey({
  companyUUID,
  coaId,
}: {
  companyUUID: string;
  coaId: string;
}): string {
  return `${OUTBOX_INTENT.GL_BALANCE_RECALC_REQUESTED}:${companyUUID}:${coaId}`;
}

/**
 * Writes a GL balance recalculation request to the outbox (no BullMQ enqueue).
 * Merges with existing pending requests for the same (company, coa) to avoid duplicate work.
 */
export async function writeGlBalanceRecalcOutbox(
  trx: Knex.Transaction,
  input: EnqueueGLBalanceInput,
): Promise<void> {
  const scopeKey = makeGlBalanceRecalcScopeKey({
    companyUUID: input.companyId,
    coaId: input.coaId,
  });

  let payload = enqueueGLBalanceInput.parse(input);
  const existing = await trx('app.outbox')
    .where({
      intent_type: OUTBOX_INTENT.GL_BALANCE_RECALC_REQUESTED,
      scope_key: scopeKey,
      status: 'pending',
    })
    .first<{ payload: unknown }>('payload');

  if (existing?.payload) {
    const previous = enqueueGLBalanceInput.parse(existing.payload);

    const mergedRange = mergeBalanceRecalcRanges(
      previous.recalcFrom,
      previous.recalcTo,
      input.recalcFrom,
      undefined, // current recalcTo
    );

    payload = {
      ...input,
      recalcFrom: mergedRange.from,
      recalcTo: mergedRange.to,
    };
  }

  await writeOutbox(trx, {
    intentType: OUTBOX_INTENT.GL_BALANCE_RECALC_REQUESTED,
    scopeKey,
    payload,
  });
}

export async function writeGlBalanceRecalcsForBoundsOutbox(
  trx: Knex.Transaction,
  input: {
    companyId: string;
    bounds: Map<string, { min: string }>; // coaId → earliest affected date
    triggeredBy: 'ledger_entry';
  },
): Promise<void> {
  for (const [coaId, range] of input.bounds) {
    await writeGlBalanceRecalcOutbox(trx, {
      companyId: input.companyId,
      coaId,
      recalcFrom: range.min,
      triggeredBy: input.triggeredBy,
    });
  }
}

export async function handleGlBalanceRecalcOutbox(
  payload: unknown,
  trx?: Knex.Transaction,
): Promise<void> {
  const data = enqueueGLBalanceInput.parse(payload);
  await glBalanceService.recalculateBalance(
    {
      companyId: data.companyId,
      coaId: data.coaId,
      recalcFrom: data.recalcFrom,
      recalcTo: data.recalcTo,
      triggeredBy: data.triggeredBy,
    },
    trx,
  );
}
