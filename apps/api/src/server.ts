import * as Sentry from '@sentry/node';
import { app, setupApp } from './app.js';
import { ENV, NODE_ENV } from './config/env.js';
import { initSentry } from './sentry.bootstrap.js';

const PORT = Number(ENV.PORT);
const listeningOn = '0.0.0.0';

(async () => {
  try {
    initSentry();
    await setupApp();
    Sentry.setupExpressErrorHandler(app);

    app.listen(Number(PORT), listeningOn, () => {
      console.log(`Server is running in ${NODE_ENV} on ${ENV.BACKEND_URL}`);
      console.log(`Bull Board available at ${ENV.BACKEND_URL}/admin/queues`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();
