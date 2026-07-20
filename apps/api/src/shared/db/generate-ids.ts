import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';

/**
 * Allocate one Postgres uuid v7 (time-ordered) in a single round trip.
 */
export async function generateV7Id(trx?: Knex.Transaction): Promise<string> {
  const [id] = await generateV7Ids(1, trx);
  return id!;
}

/**
 * Allocate N Postgres uuid v7 values in one query (batch-friendly).
 */
export async function generateV7Ids(
  count: number,
  trx?: Knex.Transaction,
): Promise<string[]> {
  if (count === 0) return [];

  const db = trx ?? knexClient;
  const { rows } = await db.raw<{ rows: Array<{ id: string }> }>(
    'SELECT (uuid_generate_v7())::text AS id FROM generate_series(1, ?)',
    [count],
  );
  return rows.map((r) => r.id);
}
