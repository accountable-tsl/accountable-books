import { beforeAll } from 'vitest';

import { queueBroker } from '../src/jobs/queues';

// Durable identity/encryption secrets used by bank account identity and
// connection-secret encryption. Fall back to dev defaults when the local
// env file doesn't define them so tests never depend on ambient env state.
process.env.ACCOUNT_NUMBER_HMAC_KEY ||=
  'dev-account-number-hmac-key-do-not-use-in-prod';
process.env.ACCOUNT_NUMBER_FINGERPRINT_VERSION ||= '1';
process.env.APP_ENC_KEY_ID ||= '1';
process.env.APP_ENC_KEYS ||= '1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

beforeAll(async () => {
  queueBroker.configure({
    disableAll: true,
    logSkipped: false,
  });
});
