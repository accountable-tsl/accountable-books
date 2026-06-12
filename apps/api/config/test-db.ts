import './env-loader.js';

import type { Knex } from 'knex';
import knex from 'knex';

import knexConfig from '../knexfile.js';
import { runBootstrap } from '../src/bootstrap/index.js';
import { ENV } from './env-loader.js';

let testKnex: Knex | null = null;

export function getTestDb(): Knex {
  if (!testKnex) {
    const testConfig = knexConfig.test || knexConfig.local;
    testKnex = knex(testConfig);
  }
  return testKnex;
}

/**
 * The test database and its infrastructure (app schema, search_path, extensions)
 * are created by the Docker init script (01-setup-databases.sh).
 * This function handles migrations and bootstrap only.
 */
export async function setupTestDatabase(): Promise<void> {
  const testDbName = `${ENV.POSTGRES_DB || 'accountable_books'}_test`;
  const testDb = getTestDb();

  try {
    await testDb.raw('SELECT 1');
    console.log(`✓ Connected to test database: ${testDbName}`);

    const [, pendingMigrations] = await testDb.migrate.list();
    if (pendingMigrations.length > 0) {
      console.log(
        `Running ${pendingMigrations.length} pending migration(s) on test database...`,
      );
      await testDb.migrate.latest();
      console.log('✓ Test database migrations completed successfully');
    } else {
      console.log('✓ Test database already up to date, skipping migrations');
    }

    await runBootstrap(testDb);
    console.log('✓ Test database bootstrap completed successfully');
  } catch (error) {
    throw new Error(`Test database setup failed: ${error}`);
  }
}

/**
 * Teardown function to call after all tests
 */
export async function closeTestDbConnection(): Promise<void> {
  if (testKnex) {
    await testKnex.destroy();
    testKnex = null;
  }
}

/**
 * Utility to check if we're in test environment
 */
export function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test';
}

/**
 * Assert that we're in test environment (safety check)
 */
export function assertTestEnvironment(): void {
  if (!isTestEnvironment()) {
    throw new Error('This function should only be called in test environment');
  }
}

/**
 * Creates a test transaction that automatically rolls back
 * Use this in your tests for perfect isolation - start transaction in beforeEach,
 * rollback in afterEach to keep test database clean
 */
export async function createTestTransaction(): Promise<Knex.Transaction> {
  const db = getTestDb();
  return await db.transaction();
}
