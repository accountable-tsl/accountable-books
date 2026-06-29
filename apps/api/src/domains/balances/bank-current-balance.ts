import type { Knex } from 'knex';

import { knexClient as db } from '../../db/knexClient.js';

type Queryable = Knex | Knex.Transaction;

/** Match the DB column precision: NUMERIC(32, 10). */
function toDbPrecision(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }
  return (Math.round(value * 1e10) / 1e10).toFixed(10);
}

/**
 * Upsert a bank account's current native balance.
 *
 * Lives here, not on BankBalanceService, so the opening-balance sub-feature can
 * reuse it without importing the full service (which imports opening-balance
 * back — a circular dependency). BankBalanceService delegates to this.
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
    })
    .onConflict(['company_id', 'bank_account_id'])
    .merge({
      native_balance: nativeBalance,
      as_of_time: now,
    });
}
