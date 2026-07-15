import type { Knex } from 'knex';

import { knexClient } from '../../../db/knexClient.js';
import {
  errorResponse,
  successResponse,
} from '../../../shared/utils/response.utils.js';
import { newBankTransactionFeedEntry } from './bank-transaction-feed-entries.types.js';

import type { ApiResponse } from '../../../core/types/api.types.js';
import type { NewBankTransactionFeedEntry } from './bank-transaction-feed-entries.types.js';

export async function upsertFeedEntry({
  data,
  trx,
}: {
  data: NewBankTransactionFeedEntry;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<{ id: string }>> {
  const parsed = newBankTransactionFeedEntry.safeParse(data);
  if (!parsed.success) {
    if (trx) {
      throw new Error('Invalid feed entry input', { cause: parsed.error });
    }
    return errorResponse('Invalid feed entry input', parsed.error.flatten());
  }

  const knex = trx ?? knexClient;
  const v = parsed.data;
  try {
    const [row] = await knex('bank_transaction_feed_entries')
      .insert({
        ...v,
        updated_at: knex.fn.now(),
      })
      .onConflict(['bank_account_feed_id', 'provider_transaction_id'])
      .merge({
        // A later provider observation may contain less information. Never
        // erase an established canonical link while refreshing the evidence.
        bank_transaction_id: knex.raw(
          'coalesce("bank_transaction_feed_entries"."bank_transaction_id", excluded.bank_transaction_id)',
        ),
        observation_type: v.observation_type,
        resolution_state: knex.raw(
          `case
             when "bank_transaction_feed_entries"."bank_transaction_id" is not null
               or excluded.bank_transaction_id is not null
             then 'resolved'
             else excluded.resolution_state
           end`,
        ),
        resolution_reason: knex.raw(
          `case
             when "bank_transaction_feed_entries"."bank_transaction_id" is not null
             then "bank_transaction_feed_entries"."resolution_reason"
             else excluded.resolution_reason
           end`,
        ),
        provider_evidence: v.provider_evidence,
        provider_evidence_schema_version: v.provider_evidence_schema_version,
        observed_at: v.observed_at,
        updated_at: knex.fn.now(),
      })
      .returning<{ id: string }[]>('id');

    return successResponse('Feed entry upserted', { id: row.id });
  } catch (error) {
    // Transactional callers require failure to abort their complete update
    // unit; returning an ignored error would permit cursor advancement.
    if (trx) throw error;
    return errorResponse('Failed to upsert feed entry', error);
  }
}
