import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import type { Knex } from 'knex';
import { z } from 'zod';

import { knexClient } from '../../db/knexClient.js';
import { enqueueOutboxDispatch } from '../work/outbox.queue.js';
import { resolveNotificationDeliveryPlan } from './notification-delivery-plan.js';
import {
  getNotificationEventDefinition,
  parseNotificationEventData,
} from './notification-event-registry.js';
import { writeNotificationCommsRequestedIntent } from './notification-intent.js';
import { notifyEventSchema } from './notifications.types.js';

import type { CommsSendPayload } from '../../features/comms/index.js';
import type { NotificationCommsRoute } from './notification-delivery-plan.js';
import type { NotificationEventDefinition } from './notification-event-registry.js';
import type {
  Notification,
  NotificationCounter,
  NotificationFeedResult,
  NotificationPriority,
  NotificationReadPolicy,
  NotificationRow,
  NotifyEvent,
  NotifyResult,
  ParsedNotifyEvent,
} from './notifications.types.js';

const NOTIFICATIONS_TABLE = 'app.notifications';
const MAX_FEED_LIMIT = 100;
const NOTIFICATION_CURSOR_CREATED_AT_SQL = `to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export interface NotificationFeedCursor {
  createdAt: string;
  id?: string;
}

interface NotificationFeedRow extends NotificationRow {
  cursor_created_at: string;
}

const notificationFeedCursorSchema = z
  .object({
    createdAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
      message: 'Invalid notification feed cursor timestamp',
    }),
    id: z.uuid().optional(),
  })
  .strict();

function toIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toIsoOrNull(value: Date | string | null): string | null {
  if (value == null) return null;
  return toIso(value);
}

function encodeNotificationFeedCursor(row: NotificationFeedRow): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: row.cursor_created_at,
      id: row.id,
    } satisfies Required<NotificationFeedCursor>),
    'utf8',
  ).toString('base64url');
}

function parseNotificationFeedCursorValue(
  value: string,
): NotificationFeedCursor | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const decoded = Buffer.from(trimmed, 'base64url').toString('utf8');
    const parsed = notificationFeedCursorSchema.safeParse(JSON.parse(decoded));
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // Fall through to the legacy timestamp-only cursor parser below.
  }

  const legacyDate = new Date(trimmed);
  if (!Number.isNaN(legacyDate.getTime())) {
    return { createdAt: legacyDate.toISOString() };
  }

  return null;
}

function normalizeNotificationFeedCursor(
  cursor: Date | string | NotificationFeedCursor | undefined,
): NotificationFeedCursor | null {
  if (!cursor) return null;

  if (cursor instanceof Date) {
    return Number.isNaN(cursor.getTime())
      ? null
      : { createdAt: cursor.toISOString() };
  }

  if (typeof cursor === 'string') {
    return parseNotificationFeedCursorValue(cursor);
  }

  const parsed = notificationFeedCursorSchema.safeParse(cursor);
  return parsed.success ? parsed.data : null;
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    recipientUserId: row.recipient_user_id,
    firmCompanyId: row.firm_company_id,
    clientCompanyId: row.client_company_id,
    eventType: row.event_type,
    priority: row.priority,
    readPolicy: row.read_policy,
    title: row.title,
    body: row.body,
    destination: objectOrEmpty(row.destination),
    sourceEntity: row.source_entity_type
      ? {
          type: row.source_entity_type,
          id: row.source_entity_id,
          key: row.source_entity_key,
        }
      : null,
    activityEventId: row.activity_event_id,
    workItemId: row.work_item_id,
    workItemSubjectId: row.work_item_subject_id,
    idempotencyKey: row.idempotency_key,
    seenAt: toIsoOrNull(row.seen_at),
    readAt: toIsoOrNull(row.read_at),
    archivedAt: toIsoOrNull(row.archived_at),
    occurredAt: toIso(row.occurred_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function readPolicyForPriority(
  priority: NotificationPriority,
): NotificationReadPolicy {
  return priority === 'low' || priority === 'normal'
    ? 'auto_on_view'
    : 'explicit';
}

function assertNotificationEventScope(input: {
  event: ParsedNotifyEvent;
  definition: NotificationEventDefinition;
}): void {
  const hasCompanyScope =
    input.event.firmCompanyId != null || input.event.clientCompanyId != null;

  if (input.definition.scope === 'company' && !hasCompanyScope) {
    throw new Error(
      `Notification event ${input.event.eventType} is company-scoped and requires firmCompanyId or clientCompanyId`,
    );
  }

  if (input.definition.scope === 'global' && hasCompanyScope) {
    throw new Error(
      `Notification event ${input.event.eventType} is global and must not include firmCompanyId or clientCompanyId`,
    );
  }
}

function normalizeNotifyEvent(rawEvent: NotifyEvent): ParsedNotifyEvent {
  const parsed = notifyEventSchema.parse(rawEvent);
  const definition = getNotificationEventDefinition(parsed.eventType);
  const priority = rawEvent.priority ?? definition.defaultPriority;
  const event = {
    ...parsed,
    priority,
    readPolicy:
      parsed.readPolicy ??
      definition.defaultReadPolicy ??
      readPolicyForPriority(priority),
  };

  assertNotificationEventScope({ event, definition });

  return {
    ...event,
    data: parseNotificationEventData(event),
  };
}

function notificationScope(query: Knex.QueryBuilder, companyId?: string): void {
  if (!companyId) return;

  query.andWhere((scope) => {
    scope
      .where('firm_company_id', companyId)
      .orWhere('client_company_id', companyId)
      .orWhere((globalScope) => {
        globalScope.whereNull('firm_company_id').whereNull('client_company_id');
      });
  });
}

function buildNotificationCorrelationId(event: ParsedNotifyEvent): string {
  return createHash('sha256')
    .update(`${event.recipientUserId}:${event.idempotencyKey}`)
    .digest('hex');
}

function toCommsPayload(input: {
  event: ParsedNotifyEvent;
  route: NotificationCommsRoute;
}): CommsSendPayload {
  return {
    correlation: {
      source: 'notification',
      id: buildNotificationCorrelationId(input.event),
    },
    recipients: [
      {
        channel: input.route.channel,
        address: input.route.address,
      },
    ],
    eventType: input.event.eventType,
    priority: input.event.priority,
    deliveryMode: input.route.deliveryMode,
    data: {
      ...input.event.data,
      title: input.event.title,
      body: input.event.body ?? null,
      destination: input.event.destination,
    },
  };
}

function buildCommsPayloads(input: {
  event: ParsedNotifyEvent;
  routes: NotificationCommsRoute[];
}): CommsSendPayload[] {
  return input.routes.map((route) =>
    toCommsPayload({
      event: input.event,
      route,
    }),
  );
}

async function insertNotification(
  trx: Knex.Transaction,
  event: ParsedNotifyEvent,
): Promise<{ notification: Notification; inserted: boolean }> {
  const readPolicy = event.readPolicy ?? readPolicyForPriority(event.priority);
  const occurredAt = event.occurredAt
    ? new Date(event.occurredAt)
    : trx.fn.now();

  const [insertedRow] = await trx<NotificationRow>(NOTIFICATIONS_TABLE)
    .insert({
      recipient_user_id: event.recipientUserId,
      firm_company_id: event.firmCompanyId ?? null,
      client_company_id: event.clientCompanyId ?? null,
      event_type: event.eventType,
      priority: event.priority,
      read_policy: readPolicy,
      title: event.title,
      body: event.body ?? null,
      destination: event.destination,
      source_entity_type: event.sourceEntity?.type ?? null,
      source_entity_id: event.sourceEntity?.id ?? null,
      source_entity_key: event.sourceEntity?.key ?? null,
      activity_event_id: event.activityEventId ?? null,
      work_item_id: event.workItemId ?? null,
      work_item_subject_id: event.workItemSubjectId ?? null,
      idempotency_key: event.idempotencyKey,
      occurred_at: occurredAt,
    })
    .onConflict(['recipient_user_id', 'idempotency_key'])
    .ignore()
    .returning('*');

  if (insertedRow) {
    return { notification: toNotification(insertedRow), inserted: true };
  }

  const existingRow = await trx<NotificationRow>(NOTIFICATIONS_TABLE)
    .where({
      recipient_user_id: event.recipientUserId,
      idempotency_key: event.idempotencyKey,
    })
    .first('*');

  if (!existingRow) {
    throw new Error('Notification insert conflict did not return existing row');
  }

  return { notification: toNotification(existingRow), inserted: false };
}

export async function notify(
  rawEvent: NotifyEvent,
  options: { trx?: Knex.Transaction } = {},
): Promise<NotifyResult> {
  const event = normalizeNotifyEvent(rawEvent);

  if (options.trx) {
    const plan = await resolveNotificationDeliveryPlan({
      event,
      trx: options.trx,
    });
    const result = plan.inApp.enabled
      ? await insertNotification(options.trx, event)
      : { notification: null, inserted: false };
    const payloads =
      !plan.inApp.enabled || result.inserted
        ? buildCommsPayloads({
            event,
            routes: plan.comms,
          })
        : [];

    for (const payload of payloads) {
      await writeNotificationCommsRequestedIntent(options.trx, payload);
    }

    return {
      notification: result.notification,
      inserted: result.inserted,
      suppressed: !result.notification && payloads.length === 0,
      commsRequested: payloads.length,
    };
  }

  const result = await knexClient.transaction(async (trx) => {
    const plan = await resolveNotificationDeliveryPlan({ event, trx });
    const notificationResult = plan.inApp.enabled
      ? await insertNotification(trx, event)
      : { notification: null, inserted: false };
    const payloads =
      !plan.inApp.enabled || notificationResult.inserted
        ? buildCommsPayloads({
            event,
            routes: plan.comms,
          })
        : [];

    for (const payload of payloads) {
      await writeNotificationCommsRequestedIntent(trx, payload);
    }

    return {
      notification: notificationResult.notification,
      inserted: notificationResult.inserted,
      suppressed: !notificationResult.notification && payloads.length === 0,
      commsRequested: payloads.length,
    } satisfies NotifyResult;
  });

  if (result.commsRequested > 0) {
    await enqueueOutboxDispatch('kick');
  }

  return result;
}

export async function getNotificationFeed(input: {
  recipientUserId: string;
  companyId?: string;
  limit?: number;
  before?: Date | string | NotificationFeedCursor;
  unreadOnly?: boolean;
  trx?: Knex.Transaction;
}): Promise<NotificationFeedResult> {
  const client = input.trx ?? knexClient;
  const limit = Math.min(Math.max(input.limit ?? 50, 1), MAX_FEED_LIMIT);
  const cursor = normalizeNotificationFeedCursor(input.before);

  const query = client<NotificationRow>(NOTIFICATIONS_TABLE)
    .where('recipient_user_id', input.recipientUserId)
    .whereNull('archived_at');

  notificationScope(query, input.companyId);

  if (cursor) {
    const cursorTimestamp = client.raw('?::timestamptz', [cursor.createdAt]);

    const cursorId = cursor.id;
    if (cursorId) {
      query.andWhere((page) => {
        page
          .where('created_at', '<', cursorTimestamp)
          .orWhere((tie) => {
            tie
              .where('created_at', '=', cursorTimestamp)
              .andWhere('id', '<', cursorId);
          });
      });
    } else {
      query.andWhere('created_at', '<', cursorTimestamp);
    }
  }

  if (input.unreadOnly) {
    query.whereNull('read_at');
  }

  const rows = (await query
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(limit + 1)
    .select(
      '*',
      client.raw(`${NOTIFICATION_CURSOR_CREATED_AT_SQL} as cursor_created_at`),
    )) as NotificationFeedRow[];

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const lastRow = pageRows.at(-1);

  return {
    items: pageRows.map(toNotification),
    nextCursor: hasMore && lastRow
      ? encodeNotificationFeedCursor(lastRow)
      : null,
  };
}

export async function getUnreadCounter(input: {
  userId: string;
  companyId?: string;
  trx?: Knex.Transaction;
}): Promise<NotificationCounter> {
  const client = input.trx ?? knexClient;
  const query = client<NotificationRow>(NOTIFICATIONS_TABLE)
    .where('recipient_user_id', input.userId)
    .whereNull('read_at')
    .whereNull('archived_at');

  notificationScope(query, input.companyId);

  const row = (await query
    .select(
      client.raw('count(*)::int as unread_count'),
      client.raw('max(created_at) as last_unread_at'),
    )
    .first()) as
    | { unread_count: number; last_unread_at: Date | string | null }
    | undefined;

  return {
    unreadCount: Number(row?.unread_count ?? 0),
    lastUnreadAt: toIsoOrNull(row?.last_unread_at ?? null),
  };
}

export async function markNotificationsViewed(input: {
  recipientUserId: string;
  notificationIds: string[];
  companyId?: string;
  trx?: Knex.Transaction;
}): Promise<{ seenCount: number; readCount: number }> {
  if (input.notificationIds.length === 0) {
    return { seenCount: 0, readCount: 0 };
  }

  const run = async (trx: Knex.Transaction) => {
    const seenQuery = trx<NotificationRow>(NOTIFICATIONS_TABLE)
      .where('recipient_user_id', input.recipientUserId)
      .whereIn('id', input.notificationIds)
      .whereNull('seen_at');
    notificationScope(seenQuery, input.companyId);

    const seenRows = await seenQuery
      .update({
        seen_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      })
      .returning<{ id: string }[]>('id');

    const readQuery = trx<NotificationRow>(NOTIFICATIONS_TABLE)
      .where('recipient_user_id', input.recipientUserId)
      .whereIn('id', input.notificationIds)
      .where('read_policy', 'auto_on_view')
      .whereNull('read_at');
    notificationScope(readQuery, input.companyId);

    const readRows = await readQuery
      .update({
        seen_at: trx.raw('COALESCE(seen_at, now())'),
        read_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      })
      .returning<{ id: string }[]>('id');

    return { seenCount: seenRows.length, readCount: readRows.length };
  };

  return input.trx ? run(input.trx) : knexClient.transaction(run);
}

export async function markNotificationsRead(input: {
  recipientUserId: string;
  notificationIds: string[];
  companyId?: string;
  trx?: Knex.Transaction;
}): Promise<{ readCount: number }> {
  if (input.notificationIds.length === 0) {
    return { readCount: 0 };
  }

  const run = async (trx: Knex.Transaction) => {
    const query = trx<NotificationRow>(NOTIFICATIONS_TABLE)
      .where('recipient_user_id', input.recipientUserId)
      .whereIn('id', input.notificationIds)
      .whereNull('read_at');
    notificationScope(query, input.companyId);

    const rows = await query
      .update({
        seen_at: trx.raw('COALESCE(seen_at, now())'),
        read_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      })
      .returning<{ id: string }[]>('id');

    return { readCount: rows.length };
  };

  return input.trx ? run(input.trx) : knexClient.transaction(run);
}

export async function markAllNotificationsRead(input: {
  recipientUserId: string;
  companyId?: string;
  trx?: Knex.Transaction;
}): Promise<{ readCount: number }> {
  const run = async (trx: Knex.Transaction) => {
    const query = trx<NotificationRow>(NOTIFICATIONS_TABLE)
      .where('recipient_user_id', input.recipientUserId)
      .whereNull('archived_at')
      .whereNull('read_at');
    notificationScope(query, input.companyId);

    const rows = await query
      .update({
        seen_at: trx.raw('COALESCE(seen_at, now())'),
        read_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      })
      .returning<{ id: string }[]>('id');

    return { readCount: rows.length };
  };

  return input.trx ? run(input.trx) : knexClient.transaction(run);
}
