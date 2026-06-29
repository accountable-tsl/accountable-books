import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';
import { getLogger } from '../../shared/utils/logger.js';
import { scheduleOutboxDrainNudge } from './outbox.queue.js';

import type { OutboxClaimFilter, OutboxIntentType } from './intents.js';

export type { OutboxClaimFilter };

const logger = getLogger({ component: 'outbox-model' });

const OUTBOX_TABLE = 'app.outbox';

export const OUTBOX_MAX_DISPATCH_ATTEMPTS = 10;
export const OUTBOX_PROCESSED_RETENTION_DAYS = 7;

export interface OutboxRow {
  id: string;
  intent_type: string;
  scope_key: string;
  payload: unknown;
  status: 'pending' | 'processed' | 'failed';
  available_at: Date;
  completed_at: Date | null;
  dispatch_attempt_count: number;
  last_error: string | null;
  failed_at: Date | null;
}

/** Must use the same `trx` as the owning domain fact. */
export async function writeOutbox(
  trx: Knex.Transaction,
  input: {
    intentType: OutboxIntentType;
    scopeKey: string;
    payload: Record<string, unknown>;
  },
): Promise<{ id: string }> {
  const [row] = (await trx
    .raw(
      `
    INSERT INTO ${OUTBOX_TABLE} (intent_type, scope_key, payload, available_at)
    VALUES (?, ?, ?::jsonb, now())
    ON CONFLICT (intent_type, scope_key) WHERE status = 'pending'
    DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
    RETURNING id
    `,
      [input.intentType, input.scopeKey, JSON.stringify(input.payload)],
    )
    .then((result: { rows: Array<{ id: string }> }) => result.rows)) as Array<{
    id: string;
  }>;

  scheduleOutboxDrainNudge(trx, input.intentType);

  return { id: row.id };
}

export async function claimNextPendingIntent(
  trx: Knex.Transaction,
  options?: OutboxClaimFilter,
): Promise<OutboxRow | null> {
  const query = trx<OutboxRow>(OUTBOX_TABLE)
    .where('status', 'pending')
    .andWhere('available_at', '<=', trx.fn.now());

  if (options?.intentType) {
    query.andWhere('intent_type', options.intentType);
  }
  if (options?.intentTypes?.length) {
    query.whereIn('intent_type', options.intentTypes);
  }
  if (options?.excludeIntentTypes?.length) {
    query.whereNotIn('intent_type', options.excludeIntentTypes);
  }
  if (options?.scopeKey) {
    query.andWhere('scope_key', options.scopeKey);
  }

  const row = await query
    .orderBy('available_at', 'asc')
    .orderBy('id', 'asc')
    .limit(1)
    .forUpdate()
    .skipLocked()
    .first();

  return row ?? null;
}

export async function markIntentProcessed(
  trx: Knex.Transaction,
  id: string,
): Promise<void> {
  await trx(OUTBOX_TABLE)
    .where({ id })
    .update({
      status: 'processed',
      completed_at: trx.fn.now(),
      dispatch_attempt_count: trx.raw('dispatch_attempt_count + 1'),
      last_error: null,
      failed_at: null,
      updated_at: trx.fn.now(),
    });
}

export async function recordIntentFailure(
  id: string,
  error: unknown,
  client: Knex = knexClient,
): Promise<{ deadLettered: boolean }> {
  const message = error instanceof Error ? error.message : String(error);
  const row = await client<OutboxRow>(OUTBOX_TABLE)
    .where({ id })
    .first('dispatch_attempt_count');
  const dispatchAttemptCount = (row?.dispatch_attempt_count ?? 0) + 1;
  const exhausted = dispatchAttemptCount >= OUTBOX_MAX_DISPATCH_ATTEMPTS;
  const backoffSeconds = Math.min(300, 2 ** Math.min(dispatchAttemptCount, 8));

  await client(OUTBOX_TABLE)
    .where({ id })
    .update({
      dispatch_attempt_count: dispatchAttemptCount,
      last_error: message.slice(0, 2000),
      ...(exhausted
        ? {
            status: 'failed',
            completed_at: client.fn.now(),
            failed_at: client.fn.now(),
          }
        : {
            status: 'pending',
            available_at: client.raw(`now() + (interval '1 second' * ?)`, [
              backoffSeconds,
            ]),
          }),
      updated_at: client.fn.now(),
    });

  if (exhausted) {
    logger.error(
      { outboxId: id, dispatchAttemptCount, error: message },
      'Outbox intent dead-lettered after exhausting max dispatch attempts',
    );
    return { deadLettered: true };
  }

  logger.warn(
    { outboxId: id, dispatchAttemptCount, backoffSeconds, error: message },
    'Outbox intent dispatch failed; scheduled for retry',
  );
  return { deadLettered: false };
}

export async function deferIntent(
  id: string,
  client: Knex = knexClient,
  delaySeconds = 1,
): Promise<void> {
  await client(OUTBOX_TABLE)
    .where({ id })
    .update({
      status: 'pending',
      available_at: client.raw(`now() + (interval '1 second' * ?)`, [
        delaySeconds,
      ]),
      updated_at: client.fn.now(),
    });
}

export async function purgeProcessedOutboxIntents(
  retentionDays = OUTBOX_PROCESSED_RETENTION_DAYS,
  client: Knex = knexClient,
): Promise<{ deleted: number }> {
  const deleted = await client(OUTBOX_TABLE)
    .whereIn('status', ['processed', 'failed'])
    .andWhere(
      'completed_at',
      '<',
      client.raw(`now() - (interval '1 day' * ?)`, [retentionDays]),
    )
    .delete();

  if (deleted > 0) {
    logger.info({ deleted, retentionDays }, 'Purged terminal outbox intents');
  }

  return { deleted };
}

export interface OutboxHealthSnapshot {
  failedCount: number;
  pendingCount: number;
  /** Age of the oldest due pending row; null when nothing is overdue. */
  oldestPendingAgeSeconds: number | null;
}

export async function getOutboxHealthSnapshot(
  client: Knex = knexClient,
): Promise<OutboxHealthSnapshot> {
  const result = await client.raw(
    `
    SELECT
      count(*) FILTER (WHERE status = 'failed')::int AS failed_count,
      count(*) FILTER (WHERE status = 'pending')::int AS pending_count,
      EXTRACT(EPOCH FROM (
        now() - min(available_at) FILTER (
          WHERE status = 'pending' AND available_at <= now()
        )
      ))::int AS oldest_pending_age_seconds
    FROM ${OUTBOX_TABLE}
    `,
  );

  const row = (result.rows?.[0] ?? {}) as {
    failed_count: number | null;
    pending_count: number | null;
    oldest_pending_age_seconds: number | null;
  };

  return {
    failedCount: row.failed_count ?? 0,
    pendingCount: row.pending_count ?? 0,
    oldestPendingAgeSeconds: row.oldest_pending_age_seconds ?? null,
  };
}
