import type { Knex } from 'knex';

import { knexClient } from '../../../db/knexClient.js';
import { OUTBOX_INTENT } from '../../outbox/intents.js';
import { writeOutbox } from '../../outbox/outbox.model.js';
import { bankProviderWebhookEvent } from './bank-provider-webhook-events.types.js';

import type { BankProviderWebhookEvent } from './bank-provider-webhook-events.types.js';

const TABLE = 'bank_provider_webhook_events';

function parseEvent(row: unknown): BankProviderWebhookEvent {
  return bankProviderWebhookEvent.parse(row);
}

export function providerWebhookEventScopeKey(eventId: string): string {
  return `provider_webhook_event:${eventId}`;
}

export async function ingestProviderWebhookEvent({
  providerKey,
  providerItemId,
  eventType,
  eventCode,
  dedupeKey,
  payload,
  trx,
}: {
  providerKey: string;
  providerItemId: string | null;
  eventType: string;
  eventCode: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  trx: Knex.Transaction;
}): Promise<{ inserted: boolean; eventId: string | null }> {
  const inserted = await trx(TABLE)
    .insert({
      provider_key: providerKey,
      provider_item_id: providerItemId,
      event_type: eventType,
      event_code: eventCode,
      dedupe_key: dedupeKey,
      payload,
      status: 'pending',
    })
    .onConflict(['provider_key', 'dedupe_key'])
    .ignore()
    .returning<{ id: string }[]>('id');

  const eventId = inserted[0]?.id ?? null;
  if (!eventId) {
    return { inserted: false, eventId: null };
  }

  await writeOutbox(trx, {
    intentType: OUTBOX_INTENT.PROVIDER_WEBHOOK_RECEIVED,
    scopeKey: providerWebhookEventScopeKey(eventId),
    payload: { eventId, providerKey },
  });

  return { inserted: true, eventId };
}

export async function getProviderWebhookEvent({
  eventId,
  trx,
}: {
  eventId: string;
  trx?: Knex | Knex.Transaction;
}): Promise<BankProviderWebhookEvent | null> {
  const knex = trx ?? knexClient;
  const row = await knex(TABLE).where({ id: eventId }).first();
  if (!row) return null;
  return parseEvent(row);
}

export async function attachBankConnectionToWebhookEvent({
  eventId,
  bankConnectionId,
  trx,
}: {
  eventId: string;
  bankConnectionId: string;
  trx: Knex | Knex.Transaction;
}): Promise<void> {
  await trx(TABLE).where({ id: eventId }).update({
    bank_connection_id: bankConnectionId,
    updated_at: trx.fn.now(),
  });
}

export async function markProviderWebhookEventCompleted({
  eventId,
  trx,
}: {
  eventId: string;
  trx: Knex | Knex.Transaction;
}): Promise<void> {
  await trx(TABLE)
    .where({ id: eventId })
    .whereIn('status', ['pending'])
    .update({
      status: 'completed',
      processed_at: trx.fn.now(),
      last_error: null,
      updated_at: trx.fn.now(),
    });
}

export async function markProviderWebhookEventQuarantined({
  eventId,
  reason,
  lastError,
  trx,
}: {
  eventId: string;
  reason: string;
  lastError?: string | null;
  trx: Knex | Knex.Transaction;
}): Promise<void> {
  await trx(TABLE)
    .where({ id: eventId })
    .whereIn('status', ['pending'])
    .update({
      status: 'quarantined',
      processed_at: trx.fn.now(),
      quarantine_reason: reason.slice(0, 2000),
      last_error: lastError?.slice(0, 2000) ?? null,
      updated_at: trx.fn.now(),
    });
}

export async function setProviderWebhookEventLastError({
  eventId,
  lastError,
  trx,
}: {
  eventId: string;
  lastError: string;
  trx?: Knex | Knex.Transaction;
}): Promise<void> {
  const knex = trx ?? knexClient;
  await knex(TABLE).where({ id: eventId }).update({
    last_error: lastError.slice(0, 2000),
    updated_at: knex.fn.now(),
  });
}
