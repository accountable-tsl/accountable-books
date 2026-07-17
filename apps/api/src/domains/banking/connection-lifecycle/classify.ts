import type { Knex } from 'knex';

export type ConnectLifecycleKind =
  | 'first'
  | 'reauth'
  | 'replace'
  | 'needs_confirmation';

export type ReplacementCandidateFeed = {
  oldFeedId: string;
  oldConnectionId: string;
  bankAccountId: string;
  providerAccountId: string;
};

export type ConnectClassification =
  | { kind: 'first' }
  | {
      kind: 'reauth';
      connectionId: string;
      authorizationStatus: string;
    }
  | {
      kind: 'replace';
      oldConnectionId: string;
      mappings: ReplacementCandidateFeed[];
    }
  | {
      kind: 'needs_confirmation';
      reason: string;
      proposed?: {
        oldConnectionIds: string[];
        mappings: ReplacementCandidateFeed[];
      };
    };

/**
 * Classifies a Link result against existing connection/feed graph for one
 * company + provider. Masks are never used.
 */
export async function classifyConnectEvent({
  trx,
  companyId,
  providerId,
  providerItemId,
  providerAccountIds,
}: {
  trx: Knex.Transaction;
  companyId: string;
  providerId: string;
  providerItemId: string | null | undefined;
  providerAccountIds: string[];
}): Promise<ConnectClassification> {
  if (providerItemId) {
    const sameItem = await trx('bank_connections')
      .where({
        company_id: companyId,
        provider_id: providerId,
        provider_item_id: providerItemId,
      })
      .first<{ id: string; authorization_status: string }>(
        'id',
        'authorization_status',
      );
    if (sameItem) {
      return {
        kind: 'reauth',
        connectionId: sameItem.id,
        authorizationStatus: sameItem.authorization_status,
      };
    }
  }

  if (providerAccountIds.length === 0) {
    return { kind: 'first' };
  }

  const overlappingFeeds = await trx('bank_account_feeds as baf')
    .join('bank_connections as bc', 'bc.id', 'baf.bank_connection_id')
    .where({
      'baf.company_id': companyId,
      'bc.provider_id': providerId,
    })
    .whereIn('baf.provider_account_id', providerAccountIds)
    .whereNull('baf.revoked_at')
    .modify((qb) => {
      if (providerItemId) {
        qb.andWhere((inner) => {
          inner
            .whereNull('bc.provider_item_id')
            .orWhereNot('bc.provider_item_id', providerItemId);
        });
      }
    })
    .select<
      {
        feed_id: string;
        connection_id: string;
        bank_account_id: string;
        provider_account_id: string;
      }[]
    >(
      'baf.id as feed_id',
      'baf.bank_connection_id as connection_id',
      'baf.bank_account_id as bank_account_id',
      'baf.provider_account_id as provider_account_id',
    );

  if (overlappingFeeds.length === 0) {
    return { kind: 'first' };
  }

  const connectionIds = [
    ...new Set(overlappingFeeds.map((row) => row.connection_id)),
  ];
  const mappings: ReplacementCandidateFeed[] = overlappingFeeds.map((row) => ({
    oldFeedId: row.feed_id,
    oldConnectionId: row.connection_id,
    bankAccountId: row.bank_account_id,
    providerAccountId: row.provider_account_id,
  }));

  if (connectionIds.length !== 1) {
    return {
      kind: 'needs_confirmation',
      reason: 'New provider item overlaps active feeds on multiple connections',
      proposed: { oldConnectionIds: connectionIds, mappings },
    };
  }

  return {
    kind: 'replace',
    oldConnectionId: connectionIds[0]!,
    mappings,
  };
}
