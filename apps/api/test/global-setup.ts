import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeTestDbConnection } from '../config/test-db.js';
import { knexClient } from '../src/db/knexClient.js';
import { redis } from '../src/lib/redis.js';

const apiRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const TEST_DB_SETUP_HINT = [
  'Test database setup failed.',
  'Run manually:',
  '  pnpm -F @accountable-books/api run migrate:test',
  '  pnpm -F @accountable-books/api run bootstrap:test',
].join('\n');

function runPnpmScript(script: string): void {
  const result = spawnSync('pnpm', ['run', script], {
    cwd: apiRoot,
    env: { ...process.env, NODE_ENV: 'test' },
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(TEST_DB_SETUP_HINT);
  }
}

/**
 * Runs once per Vitest suite (main thread), ensuring migrations happen a single time
 * instead of once per worker. Also tears down the shared knex instance at the end.
 */
export default async function globalSetup() {
  runPnpmScript('migrate:test');
  runPnpmScript('bootstrap:test');

  return async () => {
    await closeTestDbConnection();
    await knexClient.destroy();
    redis.disconnect();
  };
}
