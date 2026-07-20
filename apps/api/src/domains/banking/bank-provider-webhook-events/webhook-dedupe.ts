import { createHash } from 'crypto';

/** Window for collapsing Plaid at-least-once redeliveries of identical bodies. */
export const WEBHOOK_DEDUPE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Plaid SYNC_UPDATES_AVAILABLE payloads are often byte-identical in steady state
 * (no delivery id / timestamp). Hash body alone and the first completed event
 * permanently blocks later sync nudges; bucket received time so same-window
 * retries collide and later deliveries create a new row.
 */
export function buildWebhookDedupeKey(
  rawBody: Buffer,
  receivedAt: Date = new Date(),
  windowMs: number = WEBHOOK_DEDUPE_WINDOW_MS,
): string {
  const bucket = Math.floor(receivedAt.getTime() / windowMs);
  return createHash('sha256')
    .update(rawBody)
    .update('\0')
    .update(String(bucket))
    .digest('hex');
}
