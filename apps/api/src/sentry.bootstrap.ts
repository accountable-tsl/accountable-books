import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { ENV, isDev, NODE_ENV } from './config/env.js';

export function initSentry() {
  Sentry.init({
    dsn: isDev ? undefined : ENV.SENTRY_DSN,
    sendDefaultPii: true,
    enabled: !isDev,
    enableLogs: true,
    release: ENV.SENTRY_RELEASE,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: isDev ? 1.0 : 0.7,
    profileSessionSampleRate: isDev ? 0 : 1.0,
    profileLifecycle: 'trace',
    environment: isDev ? 'development' : NODE_ENV === 'staging' ? 'staging' : 'production',
  });

  return Sentry;
}
