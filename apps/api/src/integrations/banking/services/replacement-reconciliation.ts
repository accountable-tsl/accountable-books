import type { Knex } from 'knex';
import { format } from 'date-fns';

import type { ProviderTransaction } from '../types/base.js';

export interface PredecessorPoolRow {
  feedEntryId: string;
  bankTransactionId: string;
  amountKey: string;
  dateYmd: string;
}

export interface ReplacementMatchPlan {
  /** Observation → predecessor feed entry to adopt. */
  adopts: Array<{
    observation: ProviderTransaction;
    predecessor: PredecessorPoolRow;
  }>;
  /** In-window observations with no confident 1:1 predecessor. */
  unmatchedImports: ProviderTransaction[];
  /** Outside overlap or not reconciling — caller routes normally. */
  passthrough: ProviderTransaction[];
}

export function toAmountKey(amount: number | string): string {
  return Number(amount).toFixed(4);
}

export function toDateYmd(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : format(date, 'yyyy-MM-dd');
}

export function matchKey(dateYmd: string, amountKey: string): string {
  return `${dateYmd}|${amountKey}`;
}

export function isWithinOverlapWindow({
  observedYmd,
  windowStartYmd,
  windowEndYmd,
}: {
  observedYmd: string | null;
  windowStartYmd: string | null;
  windowEndYmd: string | null;
}): boolean {
  if (observedYmd === null) return false;
  if (windowStartYmd !== null && observedYmd < windowStartYmd) return false;
  if (windowEndYmd !== null && observedYmd > windowEndYmd) return false;
  return windowStartYmd !== null || windowEndYmd !== null;
}

/**
 * Exact date+amount 1:1 pairing. For each key, pair min(obs, pool) as adopts;
 * leftover observations become unmatched imports.
 */
export function planReplacementMatches({
  unknownObservations,
  pool,
  windowStartYmd,
  windowEndYmd,
}: {
  unknownObservations: ProviderTransaction[];
  pool: PredecessorPoolRow[];
  windowStartYmd: string | null;
  windowEndYmd: string | null;
}): ReplacementMatchPlan {
  const adopts: ReplacementMatchPlan['adopts'] = [];
  const unmatchedImports: ProviderTransaction[] = [];
  const passthrough: ProviderTransaction[] = [];

  const inWindow: ProviderTransaction[] = [];
  for (const observation of unknownObservations) {
    const observedYmd = toDateYmd(observation.date);
    if (
      !isWithinOverlapWindow({
        observedYmd,
        windowStartYmd,
        windowEndYmd,
      })
    ) {
      passthrough.push(observation);
      continue;
    }
    inWindow.push(observation);
  }

  const poolByKey = new Map<string, PredecessorPoolRow[]>();
  for (const row of pool) {
    const key = matchKey(row.dateYmd, row.amountKey);
    const list = poolByKey.get(key) ?? [];
    list.push(row);
    poolByKey.set(key, list);
  }

  const obsByKey = new Map<string, ProviderTransaction[]>();
  for (const observation of inWindow) {
    const ymd = toDateYmd(observation.date);
    if (ymd === null) {
      unmatchedImports.push(observation);
      continue;
    }
    const key = matchKey(ymd, toAmountKey(observation.amount));
    const list = obsByKey.get(key) ?? [];
    list.push(observation);
    obsByKey.set(key, list);
  }

  for (const [key, observations] of obsByKey) {
    const candidates = poolByKey.get(key) ?? [];
    const pairCount = Math.min(observations.length, candidates.length);
    for (let i = 0; i < pairCount; i += 1) {
      adopts.push({
        observation: observations[i]!,
        predecessor: candidates[i]!,
      });
    }
    for (let i = pairCount; i < observations.length; i += 1) {
      unmatchedImports.push(observations[i]!);
    }
  }

  return { adopts, unmatchedImports, passthrough };
}

export async function loadPredecessorPool({
  trx,
  predecessorFeedId,
  bankAccountId,
  companyId,
  windowStartYmd,
  windowEndYmd,
}: {
  trx: Knex.Transaction;
  predecessorFeedId: string;
  bankAccountId: string;
  companyId: string;
  windowStartYmd: string | null;
  windowEndYmd: string | null;
}): Promise<PredecessorPoolRow[]> {
  let query = trx('bank_transaction_feed_entries as entry')
    .join('bank_transactions as txn', 'txn.id', 'entry.bank_transaction_id')
    .where({
      'entry.bank_account_feed_id': predecessorFeedId,
      'entry.company_id': companyId,
      'txn.bank_account_id': bankAccountId,
      'txn.is_deleted': false,
    })
    .whereNull('txn.superseded_by_bank_transaction_id')
    .whereNotExists(function notAlreadyAdopted() {
      this.select(trx.raw('1'))
        .from('bank_transaction_feed_entries as successor')
        .whereRaw('successor.adopted_from_feed_entry_id = entry.id');
    })
    .select<
      {
        feed_entry_id: string;
        bank_transaction_id: string;
        amount: string;
        transaction_date: Date;
      }[]
    >(
      'entry.id as feed_entry_id',
      'entry.bank_transaction_id as bank_transaction_id',
      'txn.amount as amount',
      'txn.transaction_date as transaction_date',
    );

  if (windowStartYmd) {
    query = query.andWhere('txn.transaction_date', '>=', windowStartYmd);
  }
  if (windowEndYmd) {
    query = query.andWhere('txn.transaction_date', '<=', windowEndYmd);
  }

  const rows = await query;
  return rows
    .map((row) => {
      const dateYmd = toDateYmd(row.transaction_date);
      if (!dateYmd) return null;
      return {
        feedEntryId: row.feed_entry_id,
        bankTransactionId: row.bank_transaction_id,
        amountKey: toAmountKey(row.amount),
        dateYmd,
      };
    })
    .filter((row): row is PredecessorPoolRow => row !== null);
}
