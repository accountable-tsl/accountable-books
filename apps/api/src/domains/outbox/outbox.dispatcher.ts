import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';
import { getLogger } from '../../shared/utils/logger.js';
import { dispatchActivityEventRequested } from '../activity/activity.model.js';
import { handleGlBalanceRecalcOutbox } from '../balances/gl-balance.outbox.js';
import {
  dispatchNotificationAttentionResolved,
  dispatchNotificationCommsRequested,
  dispatchNotificationRequested,
} from '../notifications/notification-dispatcher.js';
import { handleCloseSignalEvalOutbox } from '../reporting/close-readiness/signals/close-signal.outbox.js';
import { materializeWork } from '../work/work-materialization.js';
import { workMaterializationPayloadSchema } from '../work/work.types.js';
import { OUTBOX_INTENT } from './intents.js';
import { alertOutboxDeadLetter } from './outbox.alerts.js';
import {
  claimNextPendingIntent,
  deferIntent,
  markIntentProcessed,
  recordIntentFailure,
} from './outbox.model.js';

import type { OutboxClaimFilter, OutboxRow } from './outbox.model.js';

const logger = getLogger({ component: 'outbox-dispatcher' });

export type DispatchFilter = OutboxClaimFilter;

class DeferSignal extends Error {
  constructor(public readonly intentId: string) {
    super('outbox intent deferred');
    this.name = 'DeferSignal';
  }
}

type IntentOutcome = 'processed' | 'deferred' | 'failed' | 'empty';

async function dispatchIntent(
  trx: Knex.Transaction,
  row: OutboxRow,
): Promise<{ status: 'done' | 'deferred' }> {
  switch (row.intent_type) {
    case OUTBOX_INTENT.WORK_MATERIALIZATION_REQUESTED: {
      const payload = workMaterializationPayloadSchema.parse(row.payload);
      const result = await materializeWork(payload.scope, trx);
      return { status: result.status === 'deferred' ? 'deferred' : 'done' };
    }
    case OUTBOX_INTENT.ACTIVITY_EVENT_REQUESTED:
      await dispatchActivityEventRequested(row.payload, trx);
      return { status: 'done' };
    case OUTBOX_INTENT.NOTIFICATION_REQUESTED:
      await dispatchNotificationRequested(row.payload);
      return { status: 'done' };
    case OUTBOX_INTENT.NOTIFICATION_ATTENTION_RESOLVED:
      await dispatchNotificationAttentionResolved(row.payload);
      return { status: 'done' };
    case OUTBOX_INTENT.NOTIFICATION_COMMS_REQUESTED:
      await dispatchNotificationCommsRequested(row.payload);
      return { status: 'done' };
    case OUTBOX_INTENT.GL_BALANCE_RECALC_REQUESTED:
      await handleGlBalanceRecalcOutbox(row.payload, trx);
      return { status: 'done' };
    case OUTBOX_INTENT.CLOSE_SIGNAL_EVAL_REQUESTED:
      await handleCloseSignalEvalOutbox(row.payload, trx);
      return { status: 'done' };
    default:
      throw new Error(`Unknown outbox intent_type: ${row.intent_type}`);
  }
}

async function processOneIntent(
  filter?: DispatchFilter,
): Promise<IntentOutcome> {
  const result = await knexClient.transaction(
    async (
      trx,
    ): Promise<{
      outcome: IntentOutcome;
      deadLetter?: { row: OutboxRow; error: unknown };
    }> => {
      const row = await claimNextPendingIntent(trx, filter);
      if (!row) {
        return { outcome: 'empty' };
      }

      try {
        await trx.transaction(async (effectTrx) => {
          const dispatch = await dispatchIntent(effectTrx, row);
          if (dispatch.status === 'deferred') {
            throw new DeferSignal(row.id);
          }
        });
        await markIntentProcessed(trx, row.id);
        return { outcome: 'processed' };
      } catch (error) {
        if (error instanceof DeferSignal) {
          await deferIntent(error.intentId, trx);
          return { outcome: 'deferred' };
        }
        const { deadLettered } = await recordIntentFailure(row.id, error, trx);
        return {
          outcome: 'failed',
          deadLetter: deadLettered ? { row, error } : undefined,
        };
      }
    },
  );

  // Alert after commit so the notification is never inside the dispatch transaction.
  if (result.deadLetter) {
    await alertOutboxDeadLetter(result.deadLetter.row, result.deadLetter.error);
  }

  return result.outcome;
}

export async function dispatchPendingIntents(
  maxIntents = 100,
  filter?: DispatchFilter,
): Promise<{ processed: number; deferred: number; failed: number }> {
  let processed = 0;
  let deferred = 0;
  let failed = 0;

  for (let i = 0; i < maxIntents; i += 1) {
    const outcome = await processOneIntent(filter);
    if (outcome === 'empty') {
      break;
    }
    if (outcome === 'processed') processed += 1;
    else if (outcome === 'deferred') deferred += 1;
    else failed += 1;
  }

  if (processed || deferred || failed) {
    logger.info({ processed, deferred, failed }, 'Outbox dispatch batch done');
  }

  return { processed, deferred, failed };
}
