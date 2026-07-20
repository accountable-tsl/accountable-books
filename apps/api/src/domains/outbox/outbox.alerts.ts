import { alertAdmins } from '../../features/comms/index.js';
import { getLogger } from '../../shared/utils/logger.js';
import { OUTBOX_MAX_DISPATCH_ATTEMPTS } from './outbox.model.js';

import type { OutboxHealthSnapshot, OutboxRow } from './outbox.model.js';

const logger = getLogger({ component: 'outbox-alerts' });

/** Seconds the oldest due pending row may sit before we suspect the runner is stalled. */
const PENDING_STALLED_SECONDS = 10 * 60;

/** Send an admin alert without ever letting a failure propagate into dispatch. */
async function sendBestEffort(
  event: Parameters<typeof alertAdmins>[0],
): Promise<void> {
  try {
    await alertAdmins(event);
  } catch (error) {
    logger.error(
      {
        eventType: event.eventType,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to send outbox admin alert',
    );
  }
}

/** One alert per dead-lettered row (idempotency-keyed by row id). */
export async function alertOutboxDeadLetter(
  row: OutboxRow,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await sendBestEffort({
    idempotencyKey: `outbox-deadletter:${row.id}`,
    eventType: 'outbox.intent_dead_lettered',
    priority: 'critical',
    title: `Outbox job failed permanently: ${row.intent_type}`,
    body: `Job ${row.id} (${row.intent_type}) gave up after ${OUTBOX_MAX_DISPATCH_ATTEMPTS} attempts and needs attention.`,
    data: {
      outboxId: row.id,
      intentType: row.intent_type,
      scopeKey: row.scope_key,
      lastError: message.slice(0, 500),
    },
  });
}

/** Alert when there are dead-letters or the runner looks stalled. Hourly-bucketed to avoid spam. */
export async function maybeAlertOutboxHealth(
  snapshot: OutboxHealthSnapshot,
): Promise<void> {
  const hourBucket = new Date().toISOString().slice(0, 13);

  if (snapshot.failedCount > 0) {
    await sendBestEffort({
      idempotencyKey: `outbox-health-failed:${hourBucket}`,
      eventType: 'outbox.health_failed_backlog',
      priority: 'critical',
      title: `Outbox has ${snapshot.failedCount} failed job(s)`,
      body: `${snapshot.failedCount} outbox job(s) have failed permanently and need attention.`,
      data: { ...snapshot },
    });
  }

  if (
    snapshot.oldestPendingAgeSeconds !== null &&
    snapshot.oldestPendingAgeSeconds > PENDING_STALLED_SECONDS
  ) {
    await sendBestEffort({
      idempotencyKey: `outbox-health-stalled:${hourBucket}`,
      eventType: 'outbox.health_drain_stalled',
      priority: 'critical',
      title: 'Outbox jobs are not being processed',
      body: `The oldest waiting job is ${snapshot.oldestPendingAgeSeconds}s old (limit ${PENDING_STALLED_SECONDS}s); the job runner may be stalled.`,
      data: { ...snapshot },
    });
  }
}
