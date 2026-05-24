import './env-loader.js';

import type { Knex } from 'knex';
import knex from 'knex';

import knexConfig from '../knexfile.js';
import { bootstrapApplicationWorkspaces } from '../src/domains/companies/workspace-bootstrap.service.js';

/**
 * Test database utilities for running tests against a dedicated test database.
 * Uses the same PostgreSQL instance as development but with a separate test database.
 */

let testKnex: Knex | null = null;

/**
 * Get or create test database connection
 * Uses the knexfile test configuration which already handles the test database name
 */
export function getTestDb(): Knex {
  if (!testKnex) {
    const testConfig = knexConfig.test || knexConfig.local;
    testKnex = knex(testConfig);
  }
  return testKnex;
}

/**
 * Setup function to call in test setup
 * Ensures test database exists and is up to date with migrations
 * Idempotent - can be called multiple times safely
 */
export async function setupTestDatabase(): Promise<void> {
  const testDbName = `${process.env.POSTGRES_DB || 'accountable_books'}_test`;

  // Use the knexfile config for the main database connection
  const mainConfig = knexConfig.local;
  const mainDb = knex(mainConfig);

  try {
    // Idempotent database creation - only create if it doesn't exist
    const result = await mainDb.raw(
      'SELECT 1 FROM pg_database WHERE datname = ?',
      [testDbName],
    );

    if (result.rows.length === 0) {
      console.log(`Creating test database: ${testDbName}`);
      await mainDb.raw(`CREATE DATABASE "${testDbName}"`);
      console.log(`✓ Test database ${testDbName} created`);
    } else {
      console.log(`✓ Test database ${testDbName} already exists`);
    }
  } catch (error: unknown) {
    // If database already exists, that's fine (race condition handling)
    if (error instanceof Error && !error.message?.includes('already exists')) {
      console.warn(`Database creation check failed: ${error}`);
    }
  } finally {
    await mainDb.destroy();
  }

  // Connect to test database and run migrations (idempotent)
  const testDb = getTestDb();

  try {
    await testDb.raw('SELECT 1');
    console.log(`✓ Connected to test database: ${testDbName}`);

    // Check for pending migrations before running them to avoid redundant work.
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

    await bootstrapApplicationWorkspaces(testDb, {
      sideEffectMode: 'skip_jobs',
    });
    console.log('✓ Test database workspace bootstrap completed successfully');
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
