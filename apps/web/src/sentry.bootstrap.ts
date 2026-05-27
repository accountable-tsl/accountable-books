import { scrubForTelemetry } from '@accountable-books/utils/telemetry/scrub';
import * as Sentry from '@sentry/react';

const SENTRY_USER_PII_FIELDS = new Set([
  'email',
  'username',
  'ip_address',
  'name',
]);

let initialized = false;

function scrubSentryUser(
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

function scrubRequestUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

function scrubSentryEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.user) {
    event.user = scrubSentryUser(
      event.user as Record<string, unknown>,
    ) as Sentry.ErrorEvent['user'];
  }
  if (event.request?.url) {
    event.request.url = scrubRequestUrl(event.request.url);
  }
  if (event.extra) {
    event.extra = scrubForTelemetry(event.extra) as Record<string, unknown>;
  }
  if (event.contexts) {
    event.contexts = scrubForTelemetry(event.contexts) as typeof event.contexts;
  }
  return event;
}

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || initialized) return;

  initialized = true;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
  });
}

/** @internal Test helper */
export function resetSentryInitForTests(): void {
  initialized = false;
}
