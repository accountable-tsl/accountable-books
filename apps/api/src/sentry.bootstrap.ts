import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

import { ENV, isDev, NODE_ENV } from './config/env.js';
import {
  scrubForTelemetry,
  scrubSentryUser,
} from './shared/telemetry/scrub.js';

export function initSentry() {
  Sentry.init({
    dsn: isDev ? undefined : ENV.SENTRY_DSN,
    sendDefaultPii: false,
    enabled: !isDev,
    enableLogs: true,
    release: ENV.SENTRY_RELEASE,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: isDev ? 1.0 : 0.7,
    profileSessionSampleRate: isDev ? 0 : 1.0,
    profileLifecycle: 'trace',
    environment: isDev
      ? 'development'
      : NODE_ENV === 'staging'
        ? 'staging'
        : 'production',
    beforeSend(event) {
      if (event.user) {
        event.user = scrubSentryUser(
          event.user as Record<string, unknown>,
        ) as typeof event.user;
      }
      if (event.request?.data) {
        event.request.data = scrubForTelemetry(event.request.data);
      }
      if (event.extra) {
        event.extra = scrubForTelemetry(event.extra) as Record<string, unknown>;
      }
      if (event.contexts) {
        event.contexts = scrubForTelemetry(
          event.contexts,
        ) as typeof event.contexts;
      }
      return event;
    },
  });

  return Sentry;
}
