import { afterAll, beforeAll } from 'vitest';

import { closeTestDbConnection, setupTestDatabase } from '../config/test-db.js';
import { queueBroker } from '../src/jobs/queues';

// Ensure the test database exists and is migrated before any tests run.
beforeAll(async () => {
  // Disable all queues in test environment
  queueBroker.configure({
    disableAll: true,
    logSkipped: false, // Reduce noise in test output
  });

  await setupTestDatabase();
});

// Cleanly close the shared knex instance after all tests complete.
afterAll(async () => {
  await closeTestDbConnection();
});
