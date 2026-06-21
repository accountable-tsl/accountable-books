import type { Knex } from 'knex';
import { z } from 'zod';

import { commsSendPayloadSchema } from '../../features/comms/comms.types.js';
import { writeOutboxIntent } from '../work/outbox.model.js';
import { OUTBOX_INTENT } from '../work/work.types.js';
import { notifyEventSchema } from './notifications.types.js';

import type { CommsSendPayload } from '../../features/comms/index.js';
import type { NotifyEvent } from './notifications.types.js';

export const notificationRequestedPayloadSchema = z
  .object({
    event: notifyEventSchema,
  })
  .strict();
export type NotificationRequestedPayload = z.infer<
  typeof notificationRequestedPayloadSchema
>;

export const notificationAttentionResolvedPayloadSchema = z
  .object({
    recipientUserId: z.uuid(),
    attentionKey: z.string().trim().min(1),
    idempotencyKey: z.string().trim().min(1),
    companyId: z.uuid().optional(),
    resolvedAt: z.iso.datetime().optional(),
  })
  .strict();
export type NotificationAttentionResolvedPayload = z.infer<
  typeof notificationAttentionResolvedPayloadSchema
>;

export const notificationCommsRequestedPayloadSchema = z
  .object({
    payload: commsSendPayloadSchema,
  })
  .strict();
export type NotificationCommsRequestedPayload = z.infer<
  typeof notificationCommsRequestedPayloadSchema
>;

export function buildNotificationRequestedScopeKey(
  idempotencyKey: string,
): string {
  return `${OUTBOX_INTENT.NOTIFICATION_REQUESTED}:${idempotencyKey}`;
}

export function buildNotificationAttentionResolvedScopeKey(
  idempotencyKey: string,
): string {
  return `${OUTBOX_INTENT.NOTIFICATION_ATTENTION_RESOLVED}:${idempotencyKey}`;
}

export function buildNotificationCommsRequestedScopeKey(
  payload: CommsSendPayload,
): string {
  const parsed = commsSendPayloadSchema.parse(payload);
  const recipients = parsed.recipients
    .map((recipient) => `${recipient.channel}:${recipient.address}`)
    .sort()
    .join(',');

  return [
    OUTBOX_INTENT.NOTIFICATION_COMMS_REQUESTED,
    parsed.correlation.source,
    parsed.correlation.id,
    parsed.eventType,
    recipients,
  ].join(':');
}

export async function writeNotificationRequestedIntent(
  trx: Knex.Transaction,
  event: NotifyEvent,
): Promise<{ idempotencyKey: string; scopeKey: string }> {
  const parsedEvent = notifyEventSchema.parse(event);
  const scopeKey = buildNotificationRequestedScopeKey(
    parsedEvent.idempotencyKey,
  );

  await writeOutboxIntent(trx, {
    intentType: OUTBOX_INTENT.NOTIFICATION_REQUESTED,
    scopeKey,
    payload: { event: parsedEvent },
  });

  return { idempotencyKey: parsedEvent.idempotencyKey, scopeKey };
}

export async function writeNotificationAttentionResolvedIntent(
  trx: Knex.Transaction,
  payload: NotificationAttentionResolvedPayload,
): Promise<{ idempotencyKey: string; scopeKey: string }> {
  const parsedPayload = notificationAttentionResolvedPayloadSchema.parse(payload);
  const scopeKey = buildNotificationAttentionResolvedScopeKey(
    parsedPayload.idempotencyKey,
  );

  await writeOutboxIntent(trx, {
    intentType: OUTBOX_INTENT.NOTIFICATION_ATTENTION_RESOLVED,
    scopeKey,
    payload: parsedPayload,
  });

  return { idempotencyKey: parsedPayload.idempotencyKey, scopeKey };
}

export async function writeNotificationCommsRequestedIntent(
  trx: Knex.Transaction,
  payload: CommsSendPayload,
): Promise<{ scopeKey: string }> {
  const parsedPayload = commsSendPayloadSchema.parse(payload);
  const scopeKey = buildNotificationCommsRequestedScopeKey(parsedPayload);

  await writeOutboxIntent(trx, {
    intentType: OUTBOX_INTENT.NOTIFICATION_COMMS_REQUESTED,
    scopeKey,
    payload: { payload: parsedPayload },
  });

  return { scopeKey };
}
