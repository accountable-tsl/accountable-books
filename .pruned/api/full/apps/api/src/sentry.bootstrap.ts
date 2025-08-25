import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { ENV, isDev } from './config/env.js';

export function initSentry() {
  Sentry.init({
    dsn: isDev ? undefined : ENV.SENTRY_DSN,
    enabled: !isDev && !!ENV.SENTRY_DSN,
    release: ENV.SENTRY_RELEASE,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: isDev ? 0 : 1.0,
    profileSessionSampleRate: isDev ? 0 : 1.0,
    profileLifecycle: 'trace',
  });

  return Sentry;
}
