import './env-loader.js';
import knex from 'knex';
import type { Knex } from 'knex';
import { execSync } from 'child_process';
import knexConfig from '../knexfile.js';

/**
 * Test database utilities for running tests against a dedicated test database
 * Uses the same PostgreSQL instance as development but with a separate test database
 * Each test gets its own transaction that rolls back for perfect isolation
 */

let testKnex: Knex | null = null;

/**
 * Get or create test database connection
 * Uses the knexfile test configuration which already handles the test database name
 */
export function getTestDb(): Knex {
  if (!testKnex) {
    // Use the knexfile test config directly - it already handles the test database name
    const testConfig = knexConfig.test || knexConfig.local;
    testKnex = knex(testConfig);
  }
  return testKnex;
}

/**
 * Creates a test transaction that automatically rolls back
 * Use this in your tests for perfect isolation
 */
export async function createTestTransaction(): Promise<Knex.Transaction> {
  const db = getTestDb();
  const trx = await db.transaction();
  return trx;
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
  } catch (error) {
    // If database already exists, that's fine (race condition handling)
    if (!error.message?.includes('already exists')) {
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

    // Run migrations using tsx (same as package.json knex script) to handle TypeScript files
    console.log('Running migrations on test database...');
    execSync('NODE_ENV=test tsx node_modules/knex/bin/cli.js migrate:latest', {
      stdio: 'inherit', // Show migration output for debugging
      cwd: process.cwd(),
    });
    console.log('✓ Test database migrations completed successfully');
  } catch (error) {
    throw new Error(`Test database setup failed: ${error}`);
  }
}

/**
 * Teardown function to call after all tests
 */
export async function teardownTestDatabase(): Promise<void> {
  if (testKnex) {
    await testKnex.destroy();
    testKnex = null;
  }
}

/**
 * Reset the entire test database (drop and recreate)
 * Use this for a completely clean slate
 */
export async function resetTestDatabase(): Promise<void> {
  const testDbName = `${process.env.POSTGRES_DB || 'accountable_books'}_test`;

  // Use knexfile config for main database connection
  const mainConfig = knexConfig.local;
  const mainDb = knex(mainConfig);

  try {
    // Terminate any existing connections to the test database
    await mainDb.raw(
      `
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = ? AND pid <> pg_backend_pid()
    `,
      [testDbName],
    );

    // Drop and recreate the test database (idempotent)
    await mainDb.raw(`DROP DATABASE IF EXISTS "${testDbName}"`);
    await mainDb.raw(`CREATE DATABASE "${testDbName}"`);

    console.log(`✓ Test database ${testDbName} reset successfully`);
  } finally {
    await mainDb.destroy();
  }

  // Clear the testKnex instance so it reconnects with fresh state
  if (testKnex) {
    await testKnex.destroy();
    testKnex = null;
  }

  // Run setup to apply migrations
  await setupTestDatabase();
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
 * Lightweight test database setup without migrations
 * Use this when you need database connection but migrations have extension dependencies
 */
export async function setupTestDatabaseWithoutMigrations(): Promise<void> {
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
  } catch (error) {
    // If database already exists, that's fine (race condition handling)
    if (!error.message?.includes('already exists')) {
      console.warn(`Database creation check failed: ${error}`);
    }
  } finally {
    await mainDb.destroy();
  }

  // Connect to test database (without migrations)
  const testDb = getTestDb();

  try {
    await testDb.raw('SELECT 1');
    console.log(
      `✓ Connected to test database: ${testDbName} (without migrations)`,
    );
  } catch (error) {
    throw new Error(`Test database connection failed: ${error}`);
  }
}
