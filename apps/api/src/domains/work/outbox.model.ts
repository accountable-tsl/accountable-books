import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';
import { getLogger } from '../../shared/utils/logger.js';
import { OUTBOX_INTENT } from './work.types.js';

import type { OutboxIntentType } from './work.types.js';

const logger = getLogger({ component: 'outbox-model' });

const OUTBOX_TABLE = 'app.outbox_intents';

/** Stop retrying and dead-letter (status `failed`, `processed_at`, `failed_at`) after this many failed dispatch attempts. */
export const OUTBOX_MAX_DISPATCH_ATTEMPTS = 10;

/** Purge processed rows older than this many days (maintenance). */
export const OUTBOX_PROCESSED_RETENTION_DAYS = 7;

export interface OutboxRow {
  id: string;
  intent_type: string;
  scope_key: string;
  payload: unknown;
  status: 'pending' | 'processed' | 'failed';
  available_at: Date;
  processed_at: Date | null;
  dispatch_attempt_count: number;
  last_error: string | null;
  failed_at: Date | null;
}

/**
 * Write (or debounce) a semantic outbox intent inside the caller's transaction.
 *
 * Debounce: a partial UNIQUE index on (intent_type, scope_key) WHERE
 * status = 'pending' guarantees at most one pending row per scope. Repeated
 * intents for the same scope collapse onto that row (latest payload wins,
 * earliest available_at preserved), so a burst of domain mutations produces a
 * single scope recompute rather than one per mutation.
 *
 * MUST be called with the same `trx` as the owning domain fact so the intent is
 * committed atomically with it and is never written for rolled-back facts.
 */
export async function writeOutboxIntent(
  trx: Knex.Transaction,
  input: {
    intentType: OutboxIntentType;
    scopeKey: string;
    payload: Record<string, unknown>;
  },
): Promise<{ id: string }> {
  const [row] = (await trx.raw(
    `
    INSERT INTO ${OUTBOX_TABLE} (intent_type, scope_key, payload, available_at)
    VALUES (?, ?, ?::jsonb, now())
    ON CONFLICT (intent_type, scope_key) WHERE status = 'pending'
    DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
    RETURNING id
    `,
    [input.intentType, input.scopeKey, JSON.stringify(input.payload)],
  ).then((result: { rows: Array<{ id: string }> }) => result.rows)) as Array<{
    id: string;
  }>;

  return { id: row.id };
}

/**
 * Claim a single pending intent for processing using FOR UPDATE SKIP LOCKED, so
 * concurrent dispatcher workers never grab the same row. The returned row stays
 * locked for the lifetime of `trx`; the caller dispatches and then marks it
 * processed (or rolls back so it can be retried) within that same transaction.
 */
export async function claimNextPendingIntent(
  trx: Knex.Transaction,
  options?: { intentType?: OutboxIntentType; scopeKey?: string },
): Promise<OutboxRow | null> {
  const query = trx<OutboxRow>(OUTBOX_TABLE)
    .where('status', 'pending')
    .andWhere('available_at', '<=', trx.fn.now());

  if (options?.intentType) {
    query.andWhere('intent_type', options.intentType);
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

/** Mark a claimed intent durably handled (must run in the claim's trx). */
export async function markIntentProcessed(
  trx: Knex.Transaction,
  id: string,
): Promise<void> {
  await trx(OUTBOX_TABLE)
    .where({ id })
    .update({
      status: 'processed',
      processed_at: trx.fn.now(),
      dispatch_attempt_count: trx.raw('dispatch_attempt_count + 1'),
      last_error: null,
      failed_at: null,
      updated_at: trx.fn.now(),
    });
}

/**
 * Record a failed dispatch attempt while the claimed row is still locked. The
 * dispatcher runs materialization in a nested transaction/savepoint, so failed
 * side-effects are discarded before this retry state is written.
 */
export async function recordIntentFailure(
  id: string,
  error: unknown,
  client: Knex = knexClient,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const row = await client<OutboxRow>(OUTBOX_TABLE)
    .where({ id })
    .first('dispatch_attempt_count');
  const dispatchAttemptCount = (row?.dispatch_attempt_count ?? 0) + 1;
  const exhausted = dispatchAttemptCount >= OUTBOX_MAX_DISPATCH_ATTEMPTS;
  // Exponential-ish backoff capped at 5 minutes.
  const backoffSeconds = Math.min(300, 2 ** Math.min(dispatchAttemptCount, 8));

  await client(OUTBOX_TABLE)
    .where({ id })
    .update({
      dispatch_attempt_count: dispatchAttemptCount,
      last_error: message.slice(0, 2000),
      ...(exhausted
        ? {
            status: 'failed',
            processed_at: client.fn.now(),
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
    return;
  }

  logger.warn(
    { outboxId: id, dispatchAttemptCount, backoffSeconds, error: message },
    'Outbox intent dispatch failed; scheduled for retry',
  );
}

/** Re-mark a deferred intent so it is retried shortly (no failure recorded). */
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

/**
 * Delete processed outbox rows older than `retentionDays` (maintenance).
 */
export async function purgeProcessedOutboxIntents(
  retentionDays = OUTBOX_PROCESSED_RETENTION_DAYS,
  client: Knex = knexClient,
): Promise<{ deleted: number }> {
  const deleted = await client(OUTBOX_TABLE)
    .whereIn('status', ['processed', 'failed'])
    .andWhere(
      'processed_at',
      '<',
      client.raw(`now() - (interval '1 day' * ?)`, [retentionDays]),
    )
    .delete();

  if (deleted > 0) {
    logger.info(
      { deleted, retentionDays },
      'Purged processed outbox intents',
    );
  }

  return { deleted };
}

export { OUTBOX_INTENT };
