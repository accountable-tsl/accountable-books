import { closeTestDbConnection, setupTestDatabase } from '../config/test-db.js';
import { knexClient } from '../src/db/knexClient.js';
import { redis } from '../src/lib/redis.js';

/**
 * Runs once per Vitest suite (main thread), ensuring migrations happen a single time
 * instead of once per worker. Also tears down the shared knex instance at the end.
 */
export default async function globalSetup() {
  await setupTestDatabase();

  return async () => {
    await closeTestDbConnection();
    await knexClient.destroy();
    redis.disconnect();
  };
}
