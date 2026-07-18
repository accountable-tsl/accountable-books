import { randomUUID } from 'crypto';
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
  lease_token: string | null;
  follow_up_requested: boolean;
  completed_at: Date | null;
  dispatch_attempt_count: number;
  last_error: string | null;
  failed_at: Date | null;
}

/** Long-running intents hold the row via lease_token until work completes. */
export const OUTBOX_LEASE_DURATION_SECONDS = 15 * 60;
export const OUTBOX_LEASE_RENEW_INTERVAL_MS = 5 * 60 * 1000;

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
    DO UPDATE SET
      payload = EXCLUDED.payload,
      -- A leased row remains the coalescing key, so remember arrivals that
      -- cannot safely replace work already being applied.
      follow_up_requested = (
        ${OUTBOX_TABLE}.follow_up_requested
        OR ${OUTBOX_TABLE}.lease_token IS NOT NULL
      ),
      available_at = CASE
        WHEN ${OUTBOX_TABLE}.lease_token IS NULL THEN now()
        ELSE ${OUTBOX_TABLE}.available_at
      END,
      updated_at = now()
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

export interface LeasedOutboxClaim {
  row: OutboxRow;
  leaseToken: string;
}

export async function claimLeasedIntent(
  trx: Knex.Transaction,
  options?: OutboxClaimFilter,
): Promise<LeasedOutboxClaim | null> {
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

  if (!row) return null;

  const leaseToken = randomUUID();
  await trx(OUTBOX_TABLE)
    .where({ id: row.id })
    .update({
      lease_token: leaseToken,
      follow_up_requested: false,
      dispatch_attempt_count: trx.raw('dispatch_attempt_count + 1'),
      available_at: trx.raw(`now() + (interval '1 second' * ?)`, [
        OUTBOX_LEASE_DURATION_SECONDS,
      ]),
      updated_at: trx.fn.now(),
    });

  return { row, leaseToken };
}

export async function renewLeasedIntent(
  id: string,
  leaseToken: string,
  client: Knex = knexClient,
): Promise<boolean> {
  const updated = await client(OUTBOX_TABLE)
    .where({ id, lease_token: leaseToken, status: 'pending' })
    .update({
      available_at: client.raw(`now() + (interval '1 second' * ?)`, [
        OUTBOX_LEASE_DURATION_SECONDS,
      ]),
      updated_at: client.fn.now(),
    });
  return updated > 0;
}

export async function markLeasedIntentProcessed(
  id: string,
  leaseToken: string,
  client: Knex = knexClient,
): Promise<'processed' | 'requeued' | 'ownership_lost'> {
  const result = await client.raw(
    `
      UPDATE ${OUTBOX_TABLE}
      SET
        status = CASE WHEN follow_up_requested THEN 'pending' ELSE 'processed' END,
        available_at = CASE WHEN follow_up_requested THEN now() ELSE available_at END,
        completed_at = CASE WHEN follow_up_requested THEN NULL ELSE now() END,
        lease_token = NULL,
        follow_up_requested = false,
        last_error = NULL,
        failed_at = NULL,
        updated_at = now()
      WHERE id = ? AND lease_token = ? AND status = 'pending'
      RETURNING status
    `,
    [id, leaseToken],
  );
  const status = (result as { rows: Array<{ status: string }> }).rows[0]
    ?.status;
  if (!status) {
    logger.warn(
      { outboxId: id },
      'Leased outbox intent ownership lost on complete',
    );
    return 'ownership_lost';
  }
  return status === 'pending' ? 'requeued' : 'processed';
}

export async function deferLeasedIntent(
  id: string,
  leaseToken: string,
  delaySeconds = 60,
  client: Knex = knexClient,
): Promise<boolean> {
  const updated = await client(OUTBOX_TABLE)
    .where({ id, lease_token: leaseToken, status: 'pending' })
    .update({
      status: 'pending',
      lease_token: null,
      follow_up_requested: false,
      // A defer is not a failure: give back the attempt the claim charged,
      // or routine waiting (e.g. provider history still collecting) would
      // eat the retry budget and dead-letter the first real failure.
      dispatch_attempt_count: client.raw(
        'greatest(dispatch_attempt_count - 1, 0)',
      ),
      available_at: client.raw(`now() + (interval '1 second' * ?)`, [
        delaySeconds,
      ]),
      updated_at: client.fn.now(),
    });
  if (updated === 0) {
    logger.warn(
      { outboxId: id },
      'Leased outbox intent ownership lost on defer',
    );
  }
  return updated > 0;
}

export async function recordLeasedIntentFailure(
  id: string,
  leaseToken: string,
  error: unknown,
  client: Knex = knexClient,
): Promise<{ deadLettered: boolean; ownershipLost: boolean }> {
  const message = error instanceof Error ? error.message : String(error);
  const outcome = await client.transaction(async (trx) => {
    const row = await trx<OutboxRow>(OUTBOX_TABLE)
      .where({ id, lease_token: leaseToken, status: 'pending' })
      .forUpdate()
      .first('dispatch_attempt_count', 'follow_up_requested');
    if (!row) return { kind: 'ownership_lost' as const };

    const dispatchAttemptCount = row.dispatch_attempt_count ?? 0;
    const exhausted = dispatchAttemptCount >= OUTBOX_MAX_DISPATCH_ATTEMPTS;
    const restartForFollowUp = exhausted && row.follow_up_requested;
    const deadLettered = exhausted && !restartForFollowUp;
    const backoffSeconds = Math.min(
      300,
      2 ** Math.min(dispatchAttemptCount, 8),
    );

    await trx(OUTBOX_TABLE)
      .where({ id, lease_token: leaseToken, status: 'pending' })
      .update({
        lease_token: null,
        follow_up_requested: false,
        last_error: message.slice(0, 2000),
        ...(deadLettered
          ? {
              status: 'failed',
              completed_at: trx.fn.now(),
              failed_at: trx.fn.now(),
            }
          : {
              status: 'pending',
              completed_at: null,
              failed_at: null,
              ...(restartForFollowUp ? { dispatch_attempt_count: 0 } : {}),
              available_at: trx.raw(`now() + (interval '1 second' * ?)`, [
                restartForFollowUp ? 1 : backoffSeconds,
              ]),
            }),
        updated_at: trx.fn.now(),
      });

    let kind: 'dead_lettered' | 'restarted' | 'retrying' = 'retrying';
    if (deadLettered) kind = 'dead_lettered';
    if (restartForFollowUp) kind = 'restarted';
    return {
      kind,
      dispatchAttemptCount,
      backoffSeconds,
    };
  });

  if (outcome.kind === 'ownership_lost') {
    logger.warn(
      { outboxId: id },
      'Leased outbox intent ownership lost on failure',
    );
    return { deadLettered: false, ownershipLost: true };
  }

  if (outcome.kind === 'dead_lettered') {
    logger.error(
      {
        outboxId: id,
        dispatchAttemptCount: outcome.dispatchAttemptCount,
        error: message,
      },
      'Leased outbox intent dead-lettered after exhausting max dispatch attempts',
    );
    return { deadLettered: true, ownershipLost: false };
  }

  if (outcome.kind === 'restarted') {
    logger.warn(
      { outboxId: id, error: message },
      'Leased outbox intent received fresh work; retry budget restarted',
    );
    return { deadLettered: false, ownershipLost: false };
  }

  logger.warn(
    {
      outboxId: id,
      dispatchAttemptCount: outcome.dispatchAttemptCount,
      backoffSeconds: outcome.backoffSeconds,
      error: message,
    },
    'Leased outbox intent dispatch failed; scheduled for retry',
  );
  return { deadLettered: false, ownershipLost: false };
}

/**
 * Wake a still-pending, unleased intent without claiming it (e.g. provider
 * webhook nudge). Rows with an active lease_token are left alone so a live
 * worker cannot be raced by a second claim.
 */
export async function wakePendingIntent(
  intentType: OutboxIntentType,
  scopeKey: string,
  client: Knex = knexClient,
): Promise<boolean> {
  const updated = await client(OUTBOX_TABLE)
    .where({ intent_type: intentType, scope_key: scopeKey, status: 'pending' })
    .whereNull('lease_token')
    .update({
      available_at: client.fn.now(),
      updated_at: client.fn.now(),
    });
  return updated > 0;
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
