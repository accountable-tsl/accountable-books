import { beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from '../config/test-db.js';

// Ensure the test database exists and is migrated before any tests run.
beforeAll(async () => {
  await setupTestDatabase();
});

// Cleanly close the shared knex instance after all tests complete.
afterAll(async () => {
  await teardownTestDatabase();
});
