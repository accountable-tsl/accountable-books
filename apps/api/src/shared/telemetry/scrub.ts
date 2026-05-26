export { scrubForTelemetry } from '@accountable-books/utils/telemetry/scrub';

const SENTRY_USER_PII_FIELDS = new Set([
  'email',
  'username',
  'ip_address',
  'name',
]);

/** Strip PII from Sentry user context before send. */
export function scrubSentryUser(
  user: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!user) return undefined;
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(user)) {
    if (!SENTRY_USER_PII_FIELDS.has(key)) {
      kept[key] = value;
    }
  }
  return Object.keys(kept).length > 0 ? kept : undefined;
}
