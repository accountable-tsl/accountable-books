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
        // A later observation refreshes the evidence only. The canonical link
        // is never changed here; superseding uses repointFeedEntryToReplacement.
        observation_type: v.observation_type,
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

/**
 * The only sanctioned way to change a feed entry's canonical link: the
 * supersede path retires a materially corrected transaction and points its
 * provider identity at the replacement. Guarded on the current link so a
 * concurrent change makes this a no-op failure instead of a silent re-point.
 */
export async function repointFeedEntryToReplacement({
  bankAccountFeedId,
  providerTransactionId,
  fromBankTransactionId,
  toBankTransactionId,
  trx,
}: {
  bankAccountFeedId: string;
  providerTransactionId: string;
  fromBankTransactionId: string;
  toBankTransactionId: string;
  trx: Knex.Transaction;
}): Promise<void> {
  const updated = await trx('bank_transaction_feed_entries')
    .where({
      bank_account_feed_id: bankAccountFeedId,
      provider_transaction_id: providerTransactionId,
      bank_transaction_id: fromBankTransactionId,
    })
    .update({
      bank_transaction_id: toBankTransactionId,
      observation_type: 'modified',
      updated_at: trx.fn.now(),
    });
  if (updated === 0) {
    throw new Error(
      'Feed entry link changed concurrently; refusing to re-point',
    );
  }
}

/**
 * Removes the mapping when a corrected transaction leaves the imported set
 * (its replacement becomes a history candidate). The entry is recreated on
 * promotion.
 */
export async function deleteFeedEntry({
  bankAccountFeedId,
  providerTransactionId,
  trx,
}: {
  bankAccountFeedId: string;
  providerTransactionId: string;
  trx: Knex.Transaction;
}): Promise<void> {
  await trx('bank_transaction_feed_entries')
    .where({
      bank_account_feed_id: bankAccountFeedId,
      provider_transaction_id: providerTransactionId,
    })
    .delete();
}
