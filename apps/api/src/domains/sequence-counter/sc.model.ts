import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';
import { allocateSequenceInput } from './sc.types.js';

import type { AllocateSequenceInput } from './sc.types.js';

export async function allocateSequence(
  params: AllocateSequenceInput & { trx?: Knex.Transaction },
): Promise<number> {
  const { trx, ...rest } = params;
  const knex = trx ?? knexClient;

  const v = allocateSequenceInput.parse(rest);
  const { companyId, scope, bucket } = v;

  // Atomic allocate + advance (Postgres)
  // - First time: inserts next_seq=2, returns allocated 1
  // - Next times: increments next_seq, returns previous value
  const sql = `
    WITH upsert AS (
      INSERT INTO sequence_counters (company_id, scope, bucket, next_seq)
      VALUES (?, ?, ?, 2)
      ON CONFLICT (company_id, scope, bucket)
      DO UPDATE SET next_seq = sequence_counters.next_seq + 1
      RETURNING next_seq
    )
    SELECT (next_seq - 1) AS allocated_seq
    FROM upsert;
  `;

  const result = await knex.raw(sql, [companyId, scope, bucket]);
  const allocated = Number(result.rows?.[0]?.allocated_seq);

  if (!Number.isInteger(allocated) || allocated <= 0) {
    throw new Error(
      `allocateSequence: unexpected allocated_seq=${String(allocated)} for scope=${scope}, bucket=${bucket}`,
    );
  }

  return allocated;
}
