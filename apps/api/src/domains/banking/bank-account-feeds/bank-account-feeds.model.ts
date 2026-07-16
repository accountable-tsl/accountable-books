import type { Knex } from 'knex';

import { knexClient } from '../../../db/knexClient.js';
import {
  errorResponse,
  successResponse,
} from '../../../shared/utils/response.utils.js';
import {
  bankAccountFeed,
  newBankAccountFeed,
} from './bank-account-feeds.types.js';

import type { ApiResponse } from '../../../core/types/api.types.js';
import type {
  BankAccountFeed,
  NewBankAccountFeed,
} from './bank-account-feeds.types.js';

export async function createBankAccountFeed({
  data,
  trx,
}: {
  data: NewBankAccountFeed;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<{ id: string }>> {
  const parsed = newBankAccountFeed.safeParse(data);
  if (!parsed.success) {
    return errorResponse(
      'Invalid bank account feed input',
      parsed.error.flatten(),
    );
  }

  const knex = trx ?? knexClient;
  try {
    const [row] = await knex('bank_account_feeds')
      .insert({
        ...parsed.data,
        state_version: parsed.data.state_version ?? 1,
        connected_at: parsed.data.connected_at ?? knex.fn.now(),
      })
      .returning<{ id: string }[]>('id');

    return successResponse('Bank account feed created', { id: row.id });
  } catch (error) {
    return errorResponse('Failed to create bank account feed', error);
  }
}

export async function getBankAccountFeed({
  feedId,
  companyId,
  forUpdate = false,
  trx,
}: {
  feedId: string;
  companyId: string;
  forUpdate?: boolean;
  trx?: Knex | Knex.Transaction;
}): Promise<ApiResponse<BankAccountFeed>> {
  const knex = trx ?? knexClient;
  try {
    let q = knex('bank_account_feeds').where({
      id: feedId,
      company_id: companyId,
    });
    if (forUpdate) q = q.forUpdate();

    const row = await q.first();
    if (!row) return errorResponse('Bank account feed not found', null);

    const parsed = bankAccountFeed.safeParse(row);
    if (!parsed.success) {
      return errorResponse(
        'Invalid bank account feed row',
        parsed.error.flatten(),
      );
    }
    return successResponse('Bank account feed retrieved', parsed.data);
  } catch (error) {
    return errorResponse('Failed to retrieve bank account feed', error);
  }
}

export async function getActiveFeedForAccount({
  bankAccountId,
  companyId,
  forUpdate = false,
  trx,
}: {
  bankAccountId: string;
  companyId: string;
  forUpdate?: boolean;
  trx?: Knex | Knex.Transaction;
}): Promise<ApiResponse<BankAccountFeed | null>> {
  const knex = trx ?? knexClient;
  try {
    let q = knex('bank_account_feeds')
      .where({
        bank_account_id: bankAccountId,
        company_id: companyId,
      })
      .whereNull('revoked_at');
    if (forUpdate) q = q.forUpdate();

    const row = await q.first();
    if (!row) {
      return successResponse('No active feed', null);
    }
    const parsed = bankAccountFeed.safeParse(row);
    if (!parsed.success) {
      return errorResponse(
        'Invalid bank account feed row',
        parsed.error.flatten(),
      );
    }
    return successResponse('Active feed retrieved', parsed.data);
  } catch (error) {
    return errorResponse('Failed to retrieve active feed', error);
  }
}

export async function listActiveFeedsForConnection({
  connectionId,
  companyId,
  trx,
}: {
  connectionId: string;
  companyId: string;
  trx?: Knex | Knex.Transaction;
}): Promise<ApiResponse<BankAccountFeed[]>> {
  const knex = trx ?? knexClient;
  try {
    const rows = await knex('bank_account_feeds')
      .where({
        bank_connection_id: connectionId,
        company_id: companyId,
      })
      .whereNull('revoked_at')
      .select('*');

    const feeds: BankAccountFeed[] = [];
    for (const row of rows) {
      const parsed = bankAccountFeed.safeParse(row);
      if (!parsed.success) {
        return errorResponse(
          'Invalid bank account feed row',
          parsed.error.flatten(),
        );
      }
      feeds.push(parsed.data);
    }
    return successResponse('Active feeds retrieved', feeds);
  } catch (error) {
    return errorResponse('Failed to list active feeds', error);
  }
}

export type FeedApplyGuardSnapshot = {
  feedId: string;
  bankConnectionId: string;
  syncCursor: string | null;
  syncFromDate: Date | string | null;
  lastSuccessfulSyncAt: Date | null;
  providerAccountId: string;
  stateVersion: number;
};

function sameInstant(left: Date | null, right: Date | null): boolean {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null);
}

function sameCalendarDate(
  left: Date | string | null | undefined,
  right: Date | string | null | undefined,
): boolean {
  const toYmd = (value: Date | string | null | undefined): string | null => {
    if (value == null) return null;
    if (typeof value === 'string') return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
  };
  return toYmd(left) === toYmd(right);
}

export async function assertFeedApplyGuard({
  snapshot,
  companyId,
  trx,
}: {
  snapshot: FeedApplyGuardSnapshot;
  companyId: string;
  trx: Knex.Transaction;
}): Promise<ApiResponse<BankAccountFeed>> {
  const feedRes = await getBankAccountFeed({
    feedId: snapshot.feedId,
    companyId,
    forUpdate: true,
    trx,
  });
  if (!feedRes.success || !feedRes.data) {
    return errorResponse('Feed not found for apply guard', null);
  }
  const feed = feedRes.data;

  if (feed.revoked_at != null) {
    return errorResponse('Feed is revoked; refusing apply', null);
  }
  if (feed.bank_connection_id !== snapshot.bankConnectionId) {
    return errorResponse(
      'Feed connection binding changed; refusing stale apply',
      null,
    );
  }
  if (feed.state_version !== snapshot.stateVersion) {
    return errorResponse(
      'Feed state_version changed; refusing stale apply',
      null,
    );
  }
  if ((feed.sync_cursor ?? null) !== (snapshot.syncCursor ?? null)) {
    return errorResponse('Feed checkpoint changed; refusing stale apply', null);
  }
  if (
    !sameCalendarDate(
      feed.sync_from_date ?? null,
      snapshot.syncFromDate ?? null,
    ) ||
    !sameInstant(
      feed.last_successful_sync_at ?? null,
      snapshot.lastSuccessfulSyncAt ?? null,
    )
  ) {
    return errorResponse(
      'Feed date checkpoint changed; refusing stale apply',
      null,
    );
  }
  if (feed.provider_account_id !== snapshot.providerAccountId) {
    return errorResponse(
      'Provider account binding changed; refusing apply',
      null,
    );
  }

  const connection = await trx('bank_connections')
    .where({
      id: snapshot.bankConnectionId,
      company_id: companyId,
      authorization_status: 'active',
    })
    .first('id');

  if (!connection) {
    return errorResponse('Connection not active; refusing apply', null);
  }

  return successResponse('Apply guard passed', feed);
}

export async function advanceFeedCheckpoint({
  feedId,
  companyId,
  expectedStateVersion,
  syncCursor,
  markInitialComplete,
  trx,
}: {
  feedId: string;
  companyId: string;
  expectedStateVersion: number;
  /** Opaque provider checkpoint, stored verbatim. */
  syncCursor: string | null;
  markInitialComplete: boolean;
  trx: Knex.Transaction;
}): Promise<ApiResponse<{ id: string }>> {
  try {
    // sync_from_date is deliberately untouched: the accepted starting date is
    // set at connect and only ever moved earlier by history promotion.
    const patch: Record<string, unknown> = {
      sync_cursor: syncCursor,
      last_successful_sync_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    };
    if (markInitialComplete) {
      patch.initial_sync_completed_at = trx.fn.now();
    }

    const updated = await trx('bank_account_feeds')
      .where({
        id: feedId,
        company_id: companyId,
        state_version: expectedStateVersion,
      })
      .whereNull('revoked_at')
      .update(patch);

    if (!updated) {
      return errorResponse(
        'Failed to advance feed checkpoint (CAS miss)',
        null,
      );
    }
    return successResponse('Feed checkpoint advanced', { id: feedId });
  } catch (error) {
    return errorResponse('Failed to advance feed checkpoint', error);
  }
}
