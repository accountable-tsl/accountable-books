import type { Knex } from 'knex';

import { knexClient as db } from '../../db/knexClient.js';

type Queryable = Knex | Knex.Transaction;

/** Match the DB column precision: NUMERIC(32, 10) / NUMERIC(18, 3). */
function toDbPrecision(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }
  return (Math.round(value * 1e10) / 1e10).toFixed(10);
}

/**
 * Upsert the recalc-owned computed native balance cache.
 * Never touches provider_reported_* columns.
 */
export async function updateBankCurrentBalance({
  companyId,
  bankAccountId,
  balance,
  asOf,
  client = db,
}: {
  companyId: string;
  bankAccountId: string;
  balance: number;
  asOf?: Date;
  client?: Queryable;
}): Promise<void> {
  const now = asOf ?? new Date();
  const nativeBalance = toDbPrecision(balance);

  await client('bank_account_current_native_balances')
    .insert({
      company_id: companyId,
      bank_account_id: bankAccountId,
      native_balance: nativeBalance,
      as_of_time: now,
      provider_reported_balance: null,
      provider_reported_at: null,
    })
    .onConflict(['company_id', 'bank_account_id'])
    .merge({
      native_balance: nativeBalance,
      as_of_time: now,
    });
}

/**
 * Upsert the provider-reported statement balance (connect/sync only).
 * Never overwrites the recalc-owned native_balance cache.
 */
export async function updateProviderReportedBalance({
  companyId,
  bankAccountId,
  balance,
  asOf,
  client = db,
}: {
  companyId: string;
  bankAccountId: string;
  balance: number;
  asOf?: Date;
  client?: Queryable;
}): Promise<void> {
  const reportedAt = asOf ?? new Date();
  const providerBalance = toDbPrecision(balance);

  await client('bank_account_current_native_balances')
    .insert({
      company_id: companyId,
      bank_account_id: bankAccountId,
      native_balance: null,
      as_of_time: null,
      provider_reported_balance: providerBalance,
      provider_reported_at: reportedAt,
    })
    .onConflict(['company_id', 'bank_account_id'])
    .merge({
      provider_reported_balance: providerBalance,
      provider_reported_at: reportedAt,
    });
}
