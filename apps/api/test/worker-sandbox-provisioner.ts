import { Redis } from 'ioredis';
import pg from 'pg';

import { ENV } from '../config/env-loader.js';
import { resolveRedisUrl, selectRedisDatabase } from '../config/redis-url.js';
import { resolveTestDatabaseName } from '../config/test-worker-sandbox.js';

const TEST_SUITE_LOCK_KEY = 'accountable-books:api-vitest-worker-databases';

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function dropDatabases(client: pg.Client, databaseNames: string[]) {
  const errors: unknown[] = [];
  for (const databaseName of databaseNames) {
    try {
      await client.query(
        `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`,
      );
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, 'Failed to drop API test databases');
  }
}

async function flushWorkerRedisDatabases(workerCount: number) {
  const redisUrl = resolveRedisUrl();
  if (!redisUrl) return;

  const results = await Promise.allSettled(
    Array.from({ length: workerCount }, async (_, index) => {
      const client = new Redis(selectRedisDatabase(redisUrl, index + 1), {
        enableOfflineQueue: false,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
      try {
        await client.connect();
        await client.flushdb();
      } finally {
        client.disconnect();
      }
    }),
  );
  const errors = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  );
  if (errors.length) {
    throw new AggregateError(
      errors,
      'Failed to flush API test Redis databases',
    );
  }
}

export async function provisionTestWorkerSandboxes(
  workerCount: number,
  prepareTemplate: () => void | Promise<void>,
) {
  const baseDatabaseName = ENV.POSTGRES_DB || 'accountable_books';
  const templateDatabaseName = resolveTestDatabaseName(baseDatabaseName, null);
  const databaseNames = Array.from({ length: workerCount }, (_, index) =>
    resolveTestDatabaseName(baseDatabaseName, String(index + 1)),
  );
  const client = new pg.Client({
    host: ENV.DB_HOST || 'localhost',
    port: Number(ENV.DB_PORT) || 5432,
    user: ENV.POSTGRES_USER,
    password: ENV.POSTGRES_PASSWORD,
    database: 'postgres',
    application_name: 'accountable-books-api-vitest-global-setup',
  });

  let lockResult: pg.QueryResult<{ locked: boolean }>;
  try {
    await client.connect();
    lockResult = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
      [TEST_SUITE_LOCK_KEY],
    );
  } catch (setupError) {
    try {
      await client.end();
    } catch (cleanupError) {
      throw new AggregateError([setupError, cleanupError]);
    }
    throw setupError;
  }
  if (!lockResult.rows[0]?.locked) {
    await client.end();
    throw new Error('Another API test suite is already running');
  }

  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;

    const errors: unknown[] = [];
    const cleanup = async (operation: () => Promise<unknown>) => {
      try {
        await operation();
      } catch (error) {
        errors.push(error);
      }
    };
    await cleanup(() => dropDatabases(client, databaseNames));
    await cleanup(() => flushWorkerRedisDatabases(workerCount));
    await cleanup(() =>
      client.query('SELECT pg_advisory_unlock(hashtext($1))', [
        TEST_SUITE_LOCK_KEY,
      ]),
    );
    await cleanup(() => client.end());
    if (errors.length) {
      throw new AggregateError(errors, 'Failed to clean up API test sandboxes');
    }
  };

  try {
    await prepareTemplate();
    await dropDatabases(client, databaseNames);
    for (const databaseName of databaseNames) {
      await client.query(
        `CREATE DATABASE ${quoteIdentifier(databaseName)} WITH TEMPLATE ${quoteIdentifier(templateDatabaseName)}`,
      );
      await client.query(
        `ALTER DATABASE ${quoteIdentifier(databaseName)} SET search_path TO app, public; ALTER DATABASE ${quoteIdentifier(databaseName)} SET timezone TO 'UTC'`,
      );
    }
    await flushWorkerRedisDatabases(workerCount);
    return { dispose };
  } catch (setupError) {
    try {
      await dispose();
    } catch (cleanupError) {
      throw new AggregateError(
        [setupError, cleanupError],
        'Failed to provision and clean up API test sandboxes',
      );
    }
    throw setupError;
  }
}
