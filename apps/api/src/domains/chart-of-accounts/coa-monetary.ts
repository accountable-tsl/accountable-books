import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';

export type MonetaryEntryInput = {
  coa_id: string;
  source_currency_id: string;
  is_monetary?: boolean;
};

/**
 * COA ids whose account type has default_monetary=true (batch-friendly).
 */
export async function prefetchMonetaryCoaIds(
  companyId: string,
  coaIds: Iterable<string>,
  trx?: Knex.Transaction,
): Promise<Set<string>> {
  const ids = [...new Set(coaIds)];
  if (ids.length === 0) return new Set();

  const db = trx ?? knexClient;
  const rows = await db('coa')
    .join('account_types', 'coa.account_type_id', 'account_types.id')
    .where('coa.company_id', companyId)
    .whereIn('coa.id', ids)
    .where('coa.is_deleted', false)
    .where('account_types.default_monetary', true)
    .pluck<string>('coa.id');

  return new Set(rows);
}

/**
 * Whether a ledger line is monetary (subject to FX exposure).
 *
 * 1. Explicit entry.is_monetary
 * 2. COA account type default_monetary
 * 3. source_currency_id !== reporting_currency_id
 */
export function isMonetaryEntry(
  entry: MonetaryEntryInput,
  reportingCurrencyId: string,
  monetaryCoaIds: Set<string>,
): boolean {
  if (entry.is_monetary !== undefined) return entry.is_monetary;
  if (monetaryCoaIds.has(entry.coa_id)) return true;
  return entry.source_currency_id !== reportingCurrencyId;
}

export function buildMonetaryMap(
  entries: MonetaryEntryInput[],
  reportingCurrencyId: string,
  monetaryCoaIds: Set<string>,
): Map<number, boolean> {
  const map = new Map<number, boolean>();
  for (let i = 0; i < entries.length; i++) {
    map.set(
      i,
      isMonetaryEntry(entries[i]!, reportingCurrencyId, monetaryCoaIds),
    );
  }
  return map;
}
