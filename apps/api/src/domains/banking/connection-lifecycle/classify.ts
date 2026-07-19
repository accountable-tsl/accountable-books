import type { Knex } from 'knex';

import { deriveAccountNumberIdentity } from '../account-identity.js';

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

type OverlappingFeedRow = {
  feed_id: string;
  connection_id: string;
  bank_account_id: string;
  provider_account_id: string;
};

/**
 * Classifies a Link result against existing connection/feed graph for one
 * company + provider. Masks are never used.
 *
 * Overlap is provider_account_id and/or account-number fingerprint: Link can
 * mint a new item/account ids for the same durable bank accounts.
 */
export async function classifyConnectEvent({
  trx,
  companyId,
  providerId,
  providerItemId,
  providerAccountIds,
  bankId,
  accountNumbers,
}: {
  trx: Knex.Transaction;
  companyId: string;
  providerId: string;
  providerItemId: string | null | undefined;
  providerAccountIds: string[];
  bankId?: string | null;
  accountNumbers?: Array<string | null | undefined>;
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

  const fingerprints = uniqueFingerprints(accountNumbers);
  const hasProviderIds = providerAccountIds.length > 0;
  const hasFingerprints = Boolean(bankId && fingerprints.length > 0);

  if (!hasProviderIds && !hasFingerprints) {
    return { kind: 'first' };
  }

  const byProviderId = hasProviderIds
    ? await findActiveOverlappingFeeds(trx, {
        companyId,
        providerId,
        providerItemId,
        providerAccountIds,
      })
    : [];

  const byFingerprint = hasFingerprints
    ? await findActiveOverlappingFeedsByFingerprint(trx, {
        companyId,
        providerId,
        providerItemId,
        bankId: bankId!,
        fingerprints,
      })
    : [];

  const overlappingFeeds = dedupeOverlappingFeeds([
    ...byProviderId,
    ...byFingerprint,
  ]);

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

function uniqueFingerprints(
  accountNumbers: Array<string | null | undefined> | undefined,
): string[] {
  if (!accountNumbers?.length) return [];
  const out = new Set<string>();
  for (const raw of accountNumbers) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    try {
      out.add(deriveAccountNumberIdentity(trimmed).account_number_fingerprint);
    } catch {
      // Empty-after-normalize etc. — skip; connect will still require a number later.
    }
  }
  return [...out];
}

function applyDifferentItemFilter(
  qb: Knex.QueryBuilder,
  providerItemId: string | null | undefined,
) {
  if (!providerItemId) return;
  qb.andWhere((inner) => {
    inner
      .whereNull('bc.provider_item_id')
      .orWhereNot('bc.provider_item_id', providerItemId);
  });
}

async function findActiveOverlappingFeeds(
  trx: Knex.Transaction,
  {
    companyId,
    providerId,
    providerItemId,
    providerAccountIds,
  }: {
    companyId: string;
    providerId: string;
    providerItemId: string | null | undefined;
    providerAccountIds: string[];
  },
): Promise<OverlappingFeedRow[]> {
  return trx('bank_account_feeds as baf')
    .join('bank_connections as bc', 'bc.id', 'baf.bank_connection_id')
    .where({
      'baf.company_id': companyId,
      'bc.provider_id': providerId,
    })
    .whereIn('baf.provider_account_id', providerAccountIds)
    .whereNull('baf.revoked_at')
    .modify((qb) => applyDifferentItemFilter(qb, providerItemId))
    .select<OverlappingFeedRow[]>(
      'baf.id as feed_id',
      'baf.bank_connection_id as connection_id',
      'baf.bank_account_id as bank_account_id',
      'baf.provider_account_id as provider_account_id',
    );
}

async function findActiveOverlappingFeedsByFingerprint(
  trx: Knex.Transaction,
  {
    companyId,
    providerId,
    providerItemId,
    bankId,
    fingerprints,
  }: {
    companyId: string;
    providerId: string;
    providerItemId: string | null | undefined;
    bankId: string;
    fingerprints: string[];
  },
): Promise<OverlappingFeedRow[]> {
  return trx('bank_account_feeds as baf')
    .join('bank_connections as bc', 'bc.id', 'baf.bank_connection_id')
    .join('bank_accounts as ba', 'ba.id', 'baf.bank_account_id')
    .where({
      'baf.company_id': companyId,
      'bc.provider_id': providerId,
      'ba.company_id': companyId,
      'ba.bank_id': bankId,
      'ba.is_deleted': false,
    })
    .whereIn('ba.account_number_fingerprint', fingerprints)
    .whereNull('baf.revoked_at')
    .modify((qb) => applyDifferentItemFilter(qb, providerItemId))
    .select<OverlappingFeedRow[]>(
      'baf.id as feed_id',
      'baf.bank_connection_id as connection_id',
      'baf.bank_account_id as bank_account_id',
      'baf.provider_account_id as provider_account_id',
    );
}

function dedupeOverlappingFeeds(
  rows: OverlappingFeedRow[],
): OverlappingFeedRow[] {
  const seen = new Set<string>();
  const out: OverlappingFeedRow[] = [];
  for (const row of rows) {
    if (seen.has(row.feed_id)) continue;
    seen.add(row.feed_id);
    out.push(row);
  }
  return out;
}
