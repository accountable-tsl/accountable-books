import * as Sentry from '@sentry/node';

import { app, setupApp } from './app.js';
import { ENV, NODE_ENV } from './config/env.js';
import { markReady, markUnready } from './health.js';
import { shutdownPostHog } from './lib/posthog.js';
import { initSentry } from './sentry.bootstrap.js';
import { getLogger } from './shared/utils/logger.js';

const PORT = Number(ENV.PORT);
const listeningOn = '0.0.0.0';

const serverLogger = getLogger({
  component: 'server',
  processSource: 'api',
});

initSentry();
markUnready();

// Bind the port immediately so /health/live is reachable from first process tick.
// setupApp() runs async after — /health/ready stays 503 until it completes.
const server = app.listen(PORT, listeningOn, () => {
  serverLogger.info(
    { port: PORT, env: NODE_ENV, url: ENV.BACKEND_URL },
    'Listening',
  );
});

setupApp()
  .then(() => {
    Sentry.setupExpressErrorHandler(app);
    markReady();
    serverLogger.info('Server ready');
  })
  .catch((err) => {
    markUnready();
    serverLogger.error({ err }, 'Failed to start server');
    process.exit(1);
  });

const shutdown = async (signal: string) => {
  markUnready();
  serverLogger.info({ signal }, 'Shutting down');
  server.close(async () => {
    await shutdownPostHog();
    process.exit(0);
  });
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
