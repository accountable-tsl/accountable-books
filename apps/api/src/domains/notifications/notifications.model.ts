import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import type { Knex } from 'knex';
import { z } from 'zod';

import { knexClient } from '../../db/knexClient.js';
import { resolveNotificationDeliveryPlan } from './notification-delivery-plan.js';
import {
  getNotificationEventDefinition,
  parseNotificationEventData,
} from './notification-event-registry.js';
import { writeNotificationCommsRequestedIntent } from './notification-intent.js';
import { resolveNotificationPolicyOwner } from './notification-policy-owner.js';
import { notifyEventSchema } from './notifications.types.js';

import type { CommsSendPayload } from '../../features/comms/index.js';
import type { NotificationCommsRoute } from './notification-delivery-plan.js';
import type { NotificationEventDefinition } from './notification-event-registry.js';
import type {
  Notification,
  NotificationAttentionTransition,
  NotificationCounter,
  NotificationFeedResult,
  NotificationIdempotencyEffect,
  NotificationPriority,
  NotificationReadPolicy,
  NotificationRow,
  NotifyEvent,
  NotifyResult,
  ParsedNotifyEvent,
  ResolveNotificationAttentionResult,
} from './notifications.types.js';

const NOTIFICATIONS_TABLE = 'app.notifications';
const NOTIFICATION_IDEMPOTENCY_TABLE = 'app.notification_idempotency_keys';
const MAX_FEED_LIMIT = 100;
const NOTIFICATION_CURSOR_CREATED_AT_SQL = `to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export interface NotificationFeedCursor {
  createdAt: string;
  id?: string;
}

interface NotificationFeedRow extends NotificationRow {
  cursor_created_at: string;
}

interface NotificationIdempotencyRow {
  id: string;
  recipient_user_id: string;
  idempotency_key: string;
  notification_id: string | null;
  effect: NotificationIdempotencyEffect;
  created_at: Date | string;
  updated_at: Date | string;
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
    policyOwnerCompanyId: row.policy_owner_company_id,
    eventType: row.event_type,
    attentionKey: row.attention_key,
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
    lastAttentionTransition: row.last_attention_transition,
    seenAt: toIsoOrNull(row.seen_at),
    readAt: toIsoOrNull(row.read_at),
    resolvedAt: toIsoOrNull(row.resolved_at),
    archivedAt: toIsoOrNull(row.archived_at),
    lastMaterialChangeAt: toIsoOrNull(row.last_material_change_at),
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

function shouldMarkUnreadOnTransition(
  transition: NotificationAttentionTransition,
): boolean {
  return transition !== 'routine_update';
}

function shouldSendCommsOnTransition(
  transition: NotificationAttentionTransition,
): boolean {
  return ['opened', 'escalated', 'reassigned', 'overdue', 'failed'].includes(
    transition,
  );
}

function activeAttentionConflictTarget(client: Knex): Knex.Raw {
  return client.raw(
    `(recipient_user_id, attention_key) WHERE resolved_at IS NULL AND archived_at IS NULL`,
  );
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

  if (
    input.definition.scope === 'global' &&
    input.event.policyOwnerCompanyId != null
  ) {
    throw new Error(
      `Notification event ${input.event.eventType} is global and must not include policyOwnerCompanyId`,
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
  const policyOwnerCompanyId = resolveNotificationPolicyOwner({
    event,
    definition,
  });

  return {
    ...event,
    policyOwnerCompanyId,
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

async function reserveNotificationLifecycleEvent(
  trx: Knex.Transaction,
  input: { recipientUserId: string; idempotencyKey: string },
): Promise<
  | { reserved: true; row: NotificationIdempotencyRow }
  | {
      reserved: false;
      row: NotificationIdempotencyRow;
    }
> {
  const [insertedRow] = await trx<NotificationIdempotencyRow>(
    NOTIFICATION_IDEMPOTENCY_TABLE,
  )
    .insert({
      recipient_user_id: input.recipientUserId,
      idempotency_key: input.idempotencyKey,
      effect: 'suppressed',
    })
    .onConflict(['recipient_user_id', 'idempotency_key'])
    .ignore()
    .returning('*');

  if (insertedRow) {
    return { reserved: true, row: insertedRow };
  }

  const existingRow = await trx<NotificationIdempotencyRow>(
    NOTIFICATION_IDEMPOTENCY_TABLE,
  )
    .where({
      recipient_user_id: input.recipientUserId,
      idempotency_key: input.idempotencyKey,
    })
    .first('*');

  if (!existingRow) {
    throw new Error(
      'Notification lifecycle idempotency conflict did not return existing row',
    );
  }

  return { reserved: false, row: existingRow };
}

async function finalizeNotificationLifecycleEvent(
  trx: Knex.Transaction,
  input: {
    idempotencyRowId: string;
    effect: NotificationIdempotencyEffect;
    notificationId: string | null;
  },
): Promise<void> {
  await trx(NOTIFICATION_IDEMPOTENCY_TABLE)
    .where({ id: input.idempotencyRowId })
    .update({
      effect: input.effect,
      notification_id: input.notificationId,
      updated_at: trx.fn.now(),
    });
}

async function loadNotificationById(
  trx: Knex.Transaction,
  notificationId: string | null,
): Promise<Notification | null> {
  if (!notificationId) return null;

  const row = await trx<NotificationRow>(NOTIFICATIONS_TABLE)
    .where({ id: notificationId })
    .first('*');

  return row ? toNotification(row) : null;
}

async function resultForDuplicateLifecycleEvent(
  trx: Knex.Transaction,
  row: NotificationIdempotencyRow,
): Promise<NotifyResult> {
  const notification = await loadNotificationById(trx, row.notification_id);

  return {
    notification,
    inserted: false,
    updated: false,
    suppressed: row.effect === 'suppressed',
    commsRequested: 0,
  };
}

async function upsertAttentionNotification(
  trx: Knex.Transaction,
  event: ParsedNotifyEvent,
): Promise<{
  notification: Notification;
  inserted: boolean;
  updated: boolean;
}> {
  const readPolicy = event.readPolicy ?? readPolicyForPriority(event.priority);
  const occurredAt = event.occurredAt
    ? new Date(event.occurredAt)
    : trx.fn.now();
  const markUnread = shouldMarkUnreadOnTransition(event.attentionTransition);

  const [insertedRow] = await trx<NotificationRow>(NOTIFICATIONS_TABLE)
    .insert({
      recipient_user_id: event.recipientUserId,
      firm_company_id: event.firmCompanyId ?? null,
      client_company_id: event.clientCompanyId ?? null,
      policy_owner_company_id: event.policyOwnerCompanyId ?? null,
      event_type: event.eventType,
      attention_key: event.attentionKey,
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
      last_attention_transition: event.attentionTransition,
      last_material_change_at: markUnread ? occurredAt : null,
      occurred_at: occurredAt,
    })
    .onConflict(activeAttentionConflictTarget(trx))
    .ignore()
    .returning('*');

  if (insertedRow) {
    return {
      notification: toNotification(insertedRow),
      inserted: true,
      updated: false,
    };
  }

  const existingRow = await trx<NotificationRow>(NOTIFICATIONS_TABLE)
    .where({
      recipient_user_id: event.recipientUserId,
      attention_key: event.attentionKey,
    })
    .whereNull('resolved_at')
    .whereNull('archived_at')
    .forUpdate()
    .first('*');

  if (!existingRow) {
    throw new Error(
      'Notification active attention conflict did not return existing row',
    );
  }

  const [updatedRow] = await trx<NotificationRow>(NOTIFICATIONS_TABLE)
    .where({ id: existingRow.id })
    .update({
      firm_company_id: event.firmCompanyId ?? null,
      client_company_id: event.clientCompanyId ?? null,
      policy_owner_company_id: event.policyOwnerCompanyId ?? null,
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
      last_attention_transition: event.attentionTransition,
      occurred_at: occurredAt,
      ...(markUnread
        ? {
            seen_at: null,
            read_at: null,
            last_material_change_at: occurredAt,
          }
        : {}),
      updated_at: trx.fn.now(),
    })
    .returning('*');

  if (!updatedRow) {
    throw new Error('Notification active attention update returned no row');
  }

  return {
    notification: toNotification(updatedRow),
    inserted: false,
    updated: true,
  };
}

function notificationEffectFor(input: {
  notification: Notification | null;
  inserted: boolean;
  updated: boolean;
  commsRequested: number;
}): NotificationIdempotencyEffect {
  if (input.inserted) return 'opened';
  if (input.updated) return 'updated';
  if (input.commsRequested > 0) return 'external_only';
  return 'suppressed';
}

export async function notify(
  rawEvent: NotifyEvent,
  options: { trx?: Knex.Transaction } = {},
): Promise<NotifyResult> {
  const event = normalizeNotifyEvent(rawEvent);

  const run = async (trx: Knex.Transaction): Promise<NotifyResult> => {
    const reservation = await reserveNotificationLifecycleEvent(trx, {
      recipientUserId: event.recipientUserId,
      idempotencyKey: event.idempotencyKey,
    });

    if (!reservation.reserved) {
      return resultForDuplicateLifecycleEvent(trx, reservation.row);
    }

    const plan = await resolveNotificationDeliveryPlan({ event, trx });
    const notificationResult = plan.inApp.enabled
      ? await upsertAttentionNotification(trx, event)
      : { notification: null, inserted: false, updated: false };
    const shouldSendComms =
      shouldSendCommsOnTransition(event.attentionTransition) &&
      (event.attentionTransition !== 'opened' ||
        notificationResult.inserted ||
        !plan.inApp.enabled);
    const payloads = shouldSendComms
      ? buildCommsPayloads({
          event,
          routes: plan.comms,
        })
      : [];

    for (const payload of payloads) {
      await writeNotificationCommsRequestedIntent(trx, payload);
    }

    const result = {
      notification: notificationResult.notification,
      inserted: notificationResult.inserted,
      updated: notificationResult.updated,
      suppressed: !notificationResult.notification && payloads.length === 0,
      commsRequested: payloads.length,
    } satisfies NotifyResult;

    await finalizeNotificationLifecycleEvent(trx, {
      idempotencyRowId: reservation.row.id,
      notificationId: result.notification?.id ?? null,
      effect: notificationEffectFor(result),
    });

    return result;
  };

  if (options.trx) {
    return run(options.trx);
  }

  const result = await knexClient.transaction(run);

  return result;
}

export async function resolveNotificationAttention(
  input: {
    recipientUserId: string;
    attentionKey: string;
    idempotencyKey: string;
    resolvedAt?: Date | string;
    companyId?: string;
  },
  options: { trx?: Knex.Transaction } = {},
): Promise<ResolveNotificationAttentionResult> {
  const attentionKey = input.attentionKey.trim();
  if (!attentionKey) {
    throw new Error('Notification attentionKey is required for resolution');
  }

  const run = async (
    trx: Knex.Transaction,
  ): Promise<ResolveNotificationAttentionResult> => {
    const reservation = await reserveNotificationLifecycleEvent(trx, {
      recipientUserId: input.recipientUserId,
      idempotencyKey: input.idempotencyKey,
    });

    if (!reservation.reserved) {
      return {
        notification: await loadNotificationById(
          trx,
          reservation.row.notification_id,
        ),
        resolved: false,
      };
    }

    const resolvedAt =
      input.resolvedAt != null ? new Date(input.resolvedAt) : trx.fn.now();
    const query = trx<NotificationRow>(NOTIFICATIONS_TABLE)
      .where({
        recipient_user_id: input.recipientUserId,
        attention_key: attentionKey,
      })
      .whereNull('resolved_at')
      .whereNull('archived_at');
    notificationScope(query, input.companyId);

    const [resolvedRow] = await query
      .update({
        resolved_at: resolvedAt,
        updated_at: trx.fn.now(),
      })
      .returning('*');
    const notification = resolvedRow ? toNotification(resolvedRow) : null;

    await finalizeNotificationLifecycleEvent(trx, {
      idempotencyRowId: reservation.row.id,
      notificationId: notification?.id ?? null,
      effect: notification ? 'resolved' : 'suppressed',
    });

    return {
      notification,
      resolved: Boolean(notification),
    };
  };

  return options.trx ? run(options.trx) : knexClient.transaction(run);
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
    .whereNull('resolved_at')
    .whereNull('archived_at');

  notificationScope(query, input.companyId);

  if (cursor) {
    const cursorTimestamp = client.raw('?::timestamptz', [cursor.createdAt]);

    const cursorId = cursor.id;
    if (cursorId) {
      query.andWhere((page) => {
        page.where('created_at', '<', cursorTimestamp).orWhere((tie) => {
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
    nextCursor:
      hasMore && lastRow ? encodeNotificationFeedCursor(lastRow) : null,
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
    .whereNull('resolved_at')
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
      .whereNull('resolved_at')
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
      .whereNull('resolved_at')
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
      .whereNull('resolved_at')
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
      .whereNull('resolved_at')
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
