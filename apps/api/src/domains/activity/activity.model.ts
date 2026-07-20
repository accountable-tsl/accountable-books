import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';
import { activityEventRequestedPayloadSchema } from './activity.types.js';

import type { ActivityEvent } from './activity.types.js';

const ACTIVITY_EVENTS_TABLE = 'app.activity_events';

function actorFields(actor: ActivityEvent['actor']): {
  actor_type: 'user' | 'system';
  actor_user_id: string | null;
} {
  if (actor.type === 'user') {
    return { actor_type: 'user', actor_user_id: actor.userId };
  }
  return { actor_type: 'system', actor_user_id: null };
}

/**
 * Insert a product activity event idempotently. Duplicate outbox dispatches for
 * the same semantic event are no-ops because `idempotency_key` is unique.
 */
export async function insertActivityEvent(
  event: ActivityEvent,
  client: Knex | Knex.Transaction = knexClient,
): Promise<{ id: string | null; inserted: boolean }> {
  const parsed = activityEventRequestedPayloadSchema.parse({ event }).event;
  const actor = actorFields(parsed.actor);

  const fiscalCalendarId = parsed.fiscalCalendarId ?? null;

  const [row] = await client(ACTIVITY_EVENTS_TABLE)
    .insert({
      firm_company_id: parsed.firmCompanyId,
      client_company_id: parsed.clientCompanyId,
      actor_type: actor.actor_type,
      actor_user_id: actor.actor_user_id,
      source_entity_type: parsed.sourceEntity.type,
      source_entity_id: parsed.sourceEntity.id ?? null,
      source_entity_key: parsed.sourceEntity.key ?? null,
      ledger_transaction_id: parsed.ledgerTransactionId ?? null,
      fiscal_calendar_id: fiscalCalendarId,
      work_type: parsed.workType ?? null,
      work_item_id: parsed.workItemId ?? null,
      work_item_subject_id: parsed.workItemSubjectId ?? null,
      event_type: parsed.eventType,
      item_count: parsed.itemCount ?? null,
      amount: parsed.amount ?? null,
      currency_id: parsed.currencyId ?? null,
      metadata: parsed.metadata,
      idempotency_key: parsed.idempotencyKey,
      occurred_at: parsed.occurredAt ?? client.fn.now(),
    })
    .onConflict('idempotency_key')
    .ignore()
    .returning<{ id: string }[]>('id');

  return { id: row?.id ?? null, inserted: Boolean(row?.id) };
}

export async function dispatchActivityEventRequested(
  payload: unknown,
  trx: Knex.Transaction,
): Promise<{ inserted: boolean }> {
  const parsed = activityEventRequestedPayloadSchema.parse(payload);
  const result = await insertActivityEvent(parsed.event, trx);
  return { inserted: result.inserted };
}
