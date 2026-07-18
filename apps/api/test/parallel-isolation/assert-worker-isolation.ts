import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';

import { knexClient } from '../../src/db/knexClient.js';

const participants = ['worker-a', 'worker-b'] as const;

export async function assertWorkerIsolation(
  participant: (typeof participants)[number],
) {
  const directory = process.env.API_TEST_ISOLATION_BARRIER_DIRECTORY;
  if (!directory) throw new Error('Isolation barrier is not configured');

  const result = await knexClient.raw<{ rows: Array<{ database: string }> }>(
    'SELECT current_database() AS database',
  );
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, participant),
    JSON.stringify({
      database: result.rows[0]?.database,
      workerId: process.env.VITEST_POOL_ID,
    }),
  );

  const markerPaths = participants.map((name) => path.join(directory, name));
  await expect
    .poll(() => markerPaths.every(existsSync), { timeout: 3_000 })
    .toBe(true);

  const markers = markerPaths.map((markerPath) =>
    JSON.parse(readFileSync(markerPath, 'utf8')),
  );
  expect(new Set(markers.map(({ workerId }) => workerId)).size).toBe(2);
  expect(new Set(markers.map(({ database }) => database)).size).toBe(2);
}
