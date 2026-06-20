import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';
import { getLogger } from '../../shared/utils/logger.js';
import { dispatchActivityEventRequested } from '../activity/activity.model.js';
import {
  dispatchNotificationCommsRequested,
  dispatchNotificationRequested,
} from '../notifications/notification-dispatcher.js';
import {
  claimNextPendingIntent,
  deferIntent,
  markIntentProcessed,
  recordIntentFailure,
} from './outbox.model.js';
import { materializeWork } from './work-materialization.js';
import {
  OUTBOX_INTENT,
  workMaterializationPayloadSchema,
} from './work.types.js';

import type { OutboxRow } from './outbox.model.js';
import type { OutboxIntentType } from './work.types.js';

const logger = getLogger({ component: 'outbox-dispatcher' });

/** Narrow the drain to a subset of pending intents (e.g. a single scope). */
export interface DispatchFilter {
  intentType?: OutboxIntentType;
  scopeKey?: string;
}

/** Internal sentinel: a claimed intent could not run now (scope lock busy). */
class DeferSignal extends Error {
  constructor(public readonly intentId: string) {
    super('outbox intent deferred');
    this.name = 'DeferSignal';
  }
}

type IntentOutcome = 'processed' | 'deferred' | 'failed' | 'empty';

/**
 * Dispatch a single claimed outbox row. Reconciliation-style handlers run in
 * the claim transaction; notification/comms handoffs own their transactions and
 * rely on idempotency so a crash before marking the intent processed is safe.
 */
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
    case OUTBOX_INTENT.NOTIFICATION_COMMS_REQUESTED:
      await dispatchNotificationCommsRequested(row.payload);
      return { status: 'done' };
    default:
      // No handler yet (a later phase will add one). Surface as a failure so it
      // backs off and retries rather than being silently dropped.
      throw new Error(`Unknown outbox intent_type: ${row.intent_type}`);
  }
}

async function processOneIntent(
  filter?: DispatchFilter,
): Promise<IntentOutcome> {
  return knexClient.transaction(async (trx) => {
    const row = await claimNextPendingIntent(trx, filter);
    if (!row) {
      return 'empty' as const;
    }

    try {
      await trx.transaction(async (effectTrx) => {
        const dispatch = await dispatchIntent(effectTrx, row);
        if (dispatch.status === 'deferred') {
          throw new DeferSignal(row.id);
        }
      });
      await markIntentProcessed(trx, row.id);
      return 'processed' as const;
    } catch (error) {
      if (error instanceof DeferSignal) {
        await deferIntent(error.intentId, trx);
        return 'deferred' as const;
      }
      await recordIntentFailure(row.id, error, trx);
      return 'failed' as const;
    }
  });
}

/**
 * Drain pending outbox intents, one transaction per intent (FOR UPDATE SKIP
 * LOCKED), up to `maxIntents`. Idempotent and safe to run concurrently across
 * workers and alongside the after-commit kick. Pass `filter` to drain only a
 * subset (e.g. a single `scopeKey` for a targeted reconcile). Returns counts.
 */
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
