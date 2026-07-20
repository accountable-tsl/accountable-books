import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';

import { provisionTestWorkerSandboxes } from './worker-sandbox-provisioner.js';

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
  const env = { ...process.env, NODE_ENV: 'test' };
  delete env.VITEST_POOL_ID;
  delete env.VITEST_WORKER_ID;

  const result = spawnSync('pnpm', ['run', script], {
    cwd: apiRoot,
    env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(TEST_DB_SETUP_HINT);
  }
}

/**
 * Runs once per Vitest suite (main thread), ensuring migrations happen a single time
 * instead of once per worker. Each worker then receives a database cloned from
 * that migrated template so files can run concurrently without sharing locks.
 */
export default async function globalSetup(project: TestProject) {
  const isolationBarrierDirectory = path.join(
    os.tmpdir(),
    `accountable-books-api-vitest-${randomUUID()}`,
  );
  process.env.API_TEST_ISOLATION_BARRIER_DIRECTORY = isolationBarrierDirectory;

  const workerCount = project.config.fileParallelism
    ? project.config.maxWorkers
    : 1;
  const workerSandboxes = await provisionTestWorkerSandboxes(
    workerCount,
    () => {
      runPnpmScript('migrate:test');
      runPnpmScript('bootstrap:test');
    },
  );
  console.log(`Provisioned ${workerCount} isolated API test sandbox(es)`);

  return async () => {
    try {
      await workerSandboxes.dispose();
    } finally {
      await rm(isolationBarrierDirectory, { force: true, recursive: true });
    }
  };
}
