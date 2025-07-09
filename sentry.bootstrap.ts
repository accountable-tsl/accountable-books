import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { ENV, isDev } from "./src/config/env";

const disableSentry = !isDev;
Sentry.init({
  dsn: disableSentry
    ? "disabled"
    : ENV.SENTRY_DSN ||
      "https://dc1680a6d867d6d380f73083d6da30f3@o4509142160506880.ingest.de.sentry.io/4509142176104528",
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: 1.0,
  profileSessionSampleRate: 1.0,
  profileLifecycle: "trace",
});

// Sentry.startSpan(
//   {
//     name: "My Span",
//   },
//   () => {}
// );
