import './providers/index.js';

import type { Knex } from 'knex';

import { ENV } from '../../config/env.js';
import { knexClient } from '../../db/knexClient.js';
import { getLogger } from '../../shared/utils/logger.js';
import { enqueueCommsDelivery } from './comms.queue.js';
import {
  commsCorrelationSchema,
  commsSendPayloadSchema,
} from './comms.types.js';
import { resolveCommsProvider } from './providers/index.js';
import { resolveCommsTemplate } from './templates/comms-template-registry.js';

import type {
  CommsChannel,
  CommsDelivery,
  CommsDeliveryRow,
  CommsPriority,
  CommsRecipient,
  CommsSendPayload,
  CommsSendResult,
  ParsedCommsSendPayload,
} from './comms.types.js';

const DELIVERIES_TABLE = 'app.comms_deliveries';
const DEFAULT_COMMS_DELIVERY_RETENTION_DAYS = 90;
const TERMINAL_DELIVERY_STATUSES = [
  'sent',
  'delivered',
  'dead',
  'suppressed',
] as const;

const logger = getLogger({ component: 'comms-service' });

function toIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toIsoOrNull(value: Date | string | null): string | null {
  if (value == null) return null;
  return toIso(value);
}

function toDelivery(row: CommsDeliveryRow): CommsDelivery {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    channel: row.channel,
    providerKey: row.provider_key,
    recipientAddress: row.recipient_address,
    templateKey: row.template_key,
    templateVersion: Number(row.template_version),
    priority: row.priority,
    deliveryMode: row.delivery_mode,
    status: row.status,
    attemptCount: Number(row.attempt_count),
    providerMessageId: row.provider_message_id,
    lastError: row.last_error,
    correlation: commsCorrelationSchema.parse(row.correlation),
    queuedAt: toIso(row.queued_at),
    sentAt: toIsoOrNull(row.sent_at),
    deliveredAt: toIsoOrNull(row.delivered_at),
    failedAt: toIsoOrNull(row.failed_at),
    nextAttemptAt: toIsoOrNull(row.next_attempt_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function idempotencyKey(input: {
  payload: ParsedCommsSendPayload;
  recipient: CommsRecipient;
  templateVersion: number;
}): string {
  return [
    'comms',
    input.payload.correlation.source,
    input.payload.correlation.id,
    input.recipient.channel,
    input.payload.eventType,
    `v${input.templateVersion}`,
    input.recipient.address,
  ].join(':');
}

async function insertDelivery(
  trx: Knex.Transaction,
  input: {
    payload: ParsedCommsSendPayload;
    recipient: CommsRecipient;
  },
): Promise<{ delivery: CommsDelivery; inserted: boolean }> {
  const template = resolveCommsTemplate({
    eventType: input.payload.eventType,
    channel: input.recipient.channel,
  });
  const provider = resolveCommsProvider(input.recipient.channel);
  const key = idempotencyKey({
    payload: input.payload,
    recipient: input.recipient,
    templateVersion: template.version,
  });

  const [insertedRow] = await trx<CommsDeliveryRow>(DELIVERIES_TABLE)
    .insert({
      idempotency_key: key,
      channel: input.recipient.channel,
      provider_key: provider.key,
      recipient_address: input.recipient.address,
      template_key: input.payload.eventType,
      template_version: template.version,
      priority: input.payload.priority,
      delivery_mode: input.payload.deliveryMode,
      status: 'queued',
      correlation: input.payload.correlation,
      payload_data: input.payload.data,
      next_attempt_at: trx.fn.now(),
    })
    .onConflict('idempotency_key')
    .ignore()
    .returning('*');

  if (insertedRow) {
    return { delivery: toDelivery(insertedRow), inserted: true };
  }

  const existingRow = await trx<CommsDeliveryRow>(DELIVERIES_TABLE)
    .where({ idempotency_key: key })
    .first('*');

  if (!existingRow) {
    throw new Error('Comms delivery conflict did not return existing row');
  }

  return { delivery: toDelivery(existingRow), inserted: false };
}

async function enqueueInsertedDeliveries(
  inserted: CommsDelivery[],
): Promise<void> {
  for (const delivery of inserted) {
    await enqueueCommsDelivery(delivery.id, {
      priority: priorityForCommsDelivery(delivery.priority),
    });
  }
}

export async function send(
  payload: CommsSendPayload,
): Promise<CommsSendResult> {
  const parsed = commsSendPayloadSchema.parse(payload);

  const { deliveries, inserted } = await knexClient.transaction(async (trx) => {
    const deliveries: CommsDelivery[] = [];
    const inserted: CommsDelivery[] = [];

    for (const recipient of parsed.recipients) {
      const result = await insertDelivery(trx, {
        payload: parsed,
        recipient,
      });
      deliveries.push(result.delivery);
      if (result.inserted) {
        inserted.push(result.delivery);
      }
    }

    return { deliveries, inserted };
  });

  await enqueueInsertedDeliveries(inserted);

  return { accepted: true, deliveries };
}

export async function getCommsDeliveryById(
  id: string,
  client: Knex = knexClient,
): Promise<CommsDelivery | null> {
  const row = await client<CommsDeliveryRow>(DELIVERIES_TABLE)
    .where({ id })
    .first('*');
  return row ? toDelivery(row) : null;
}

export function resolveProviderKeyForChannel(channel: CommsChannel): string {
  return resolveCommsProvider(channel).key;
}

export function priorityForCommsDelivery(priority: CommsPriority): number {
  switch (priority) {
    case 'critical':
      return 1;
    case 'high':
      return 3;
    case 'normal':
      return 5;
    case 'low':
      return 8;
  }
}

function configuredRetentionDays(): number {
  const parsed = Number(ENV.COMMS_DELIVERY_RETENTION_DAYS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_COMMS_DELIVERY_RETENTION_DAYS;
  }
  return Math.floor(parsed);
}

export async function purgeTerminalCommsDeliveries(
  input: {
    retentionDays?: number;
    client?: Knex;
  } = {},
): Promise<{ deleted: number; retentionDays: number }> {
  const retentionDays = input.retentionDays ?? configuredRetentionDays();
  if (!Number.isInteger(retentionDays) || retentionDays <= 0) {
    throw new Error('Comms delivery retention days must be a positive integer');
  }

  const client = input.client ?? knexClient;
  const deleted = await client(DELIVERIES_TABLE)
    .whereIn('status', [...TERMINAL_DELIVERY_STATUSES])
    .andWhere(
      'updated_at',
      '<',
      client.raw(`now() - (interval '1 day' * ?)`, [retentionDays]),
    )
    .delete();

  if (deleted > 0) {
    logger.info(
      { deleted, retentionDays },
      'Purged terminal comms deliveries',
    );
  }

  return { deleted, retentionDays };
}
