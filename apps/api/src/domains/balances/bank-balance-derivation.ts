import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';

type Queryable = Knex | Knex.Transaction;

export type NativeBalanceAnchor = {
  amount: number;
  asOf: Date;
};

export type DerivedBankBalance = {
  amount: number;
  asOf: Date;
  anchorAsOf: Date;
  anchorAmount: number;
};

export type BankBalanceMovement = {
  amount: number;
  at: Date;
};

/**
 * Pure derivation: bank balance at `at` from a native provider anchor ± signed
 * finalized movements. amount > 0 is money in (same convention as daily recalc).
 *
 * - D < T: balance(D) = A − Σ amounts with time in (D, T]
 * - D > T: balance(D) = A + Σ amounts with time in (T, D]
 * - D == T: balance(D) = A
 */
export function deriveBalanceFromAnchor({
  anchor,
  at,
  movements,
}: {
  anchor: NativeBalanceAnchor;
  at: Date;
  movements: BankBalanceMovement[];
}): DerivedBankBalance {
  const anchorAmount = anchor.amount;
  const anchorMs = anchor.asOf.getTime();
  const atMs = at.getTime();

  if (atMs === anchorMs) {
    return {
      amount: anchorAmount,
      asOf: at,
      anchorAsOf: anchor.asOf,
      anchorAmount,
    };
  }

  let signedSum = 0;
  if (atMs < anchorMs) {
    for (const movement of movements) {
      const movementMs = movement.at.getTime();
      if (movementMs > atMs && movementMs <= anchorMs) {
        signedSum += movement.amount;
      }
    }
    return {
      amount: anchorAmount - signedSum,
      asOf: at,
      anchorAsOf: anchor.asOf,
      anchorAmount,
    };
  }

  for (const movement of movements) {
    const movementMs = movement.at.getTime();
    if (movementMs > anchorMs && movementMs <= atMs) {
      signedSum += movement.amount;
    }
  }
  return {
    amount: anchorAmount + signedSum,
    asOf: at,
    anchorAsOf: anchor.asOf,
    anchorAmount,
  };
}

async function loadProviderAnchor({
  companyId,
  bankAccountId,
  client,
}: {
  companyId: string;
  bankAccountId: string;
  client: Queryable;
}): Promise<NativeBalanceAnchor | null> {
  const row = await client('bank_account_current_native_balances')
    .where({
      company_id: companyId,
      bank_account_id: bankAccountId,
    })
    .whereNotNull('provider_reported_balance')
    .whereNotNull('provider_reported_at')
    .first<{
      provider_reported_balance: string;
      provider_reported_at: Date;
    }>('provider_reported_balance', 'provider_reported_at');
  if (!row) return null;
  return {
    amount: Number(row.provider_reported_balance),
    asOf: new Date(row.provider_reported_at),
  };
}

async function loadMovementsBetween({
  companyId,
  bankAccountId,
  fromExclusive,
  toInclusive,
  client,
}: {
  companyId: string;
  bankAccountId: string;
  fromExclusive: Date;
  toInclusive: Date;
  client: Queryable;
}): Promise<BankBalanceMovement[]> {
  if (fromExclusive.getTime() >= toInclusive.getTime()) {
    return [];
  }

  const rows = await client('bank_transactions')
    .where({
      company_id: companyId,
      bank_account_id: bankAccountId,
      is_deleted: false,
    })
    .andWhere('transaction_at', '>', fromExclusive)
    .andWhere('transaction_at', '<=', toInclusive)
    .select<{ amount: string; transaction_at: Date }[]>(
      'amount',
      'transaction_at',
    );

  return rows.map((row) => ({
    amount: Number(row.amount),
    at: new Date(row.transaction_at),
  }));
}

/**
 * Derive the bank balance at `at` from the provider-reported anchor.
 * Returns null when no provider-reported balance exists (unknown ≠ zero).
 */
export async function deriveBankBalanceAt({
  companyId,
  bankAccountId,
  at,
  anchor: injectedAnchor,
  trx,
}: {
  companyId: string;
  bankAccountId: string;
  at: Date;
  /** Optional override for tests / recalc without re-reading provider. */
  anchor?: NativeBalanceAnchor | null;
  trx?: Knex.Transaction;
}): Promise<DerivedBankBalance | null> {
  const client = trx ?? knexClient;
  const anchor =
    injectedAnchor === undefined
      ? await loadProviderAnchor({ companyId, bankAccountId, client })
      : injectedAnchor;
  if (!anchor) return null;

  const fromExclusive = at.getTime() < anchor.asOf.getTime() ? at : anchor.asOf;
  const toInclusive = at.getTime() < anchor.asOf.getTime() ? anchor.asOf : at;

  const movements = await loadMovementsBetween({
    companyId,
    bankAccountId,
    fromExclusive,
    toInclusive,
    client,
  });

  return deriveBalanceFromAnchor({ anchor, at, movements });
}

/**
 * Batch-derive "recorded" bank balances at `at` for many accounts.
 * Accounts without a provider-reported anchor map to null.
 */
export async function deriveRecordedBankBalances({
  companyId,
  bankAccountIds,
  at = new Date(),
  trx,
}: {
  companyId: string;
  bankAccountIds: string[];
  at?: Date;
  trx?: Knex.Transaction;
}): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (bankAccountIds.length === 0) return result;

  const client = trx ?? knexClient;
  const anchors = await client('bank_account_current_native_balances')
    .where({ company_id: companyId })
    .whereIn('bank_account_id', bankAccountIds)
    .whereNotNull('provider_reported_balance')
    .whereNotNull('provider_reported_at')
    .select<
      {
        bank_account_id: string;
        provider_reported_balance: string;
        provider_reported_at: Date;
      }[]
    >('bank_account_id', 'provider_reported_balance', 'provider_reported_at');

  const anchorByAccount = new Map(
    anchors.map((row) => [
      row.bank_account_id,
      {
        amount: Number(row.provider_reported_balance),
        asOf: new Date(row.provider_reported_at),
      } satisfies NativeBalanceAnchor,
    ]),
  );

  for (const bankAccountId of bankAccountIds) {
    if (!anchorByAccount.has(bankAccountId)) {
      result.set(bankAccountId, null);
    }
  }

  const anchoredIds = [...anchorByAccount.keys()];
  if (anchoredIds.length === 0) return result;

  // Load all movements that could fall between any account's (at, anchor) span.
  const minAsOf = Math.min(
    at.getTime(),
    ...[...anchorByAccount.values()].map((a) => a.asOf.getTime()),
  );
  const maxAsOf = Math.max(
    at.getTime(),
    ...[...anchorByAccount.values()].map((a) => a.asOf.getTime()),
  );

  const movementRows =
    minAsOf < maxAsOf
      ? await client('bank_transactions')
          .where({
            company_id: companyId,
            is_deleted: false,
          })
          .whereIn('bank_account_id', anchoredIds)
          .andWhere('transaction_at', '>', new Date(minAsOf))
          .andWhere('transaction_at', '<=', new Date(maxAsOf))
          .select<
            {
              bank_account_id: string;
              amount: string;
              transaction_at: Date;
            }[]
          >('bank_account_id', 'amount', 'transaction_at')
      : [];

  const movementsByAccount = new Map<string, BankBalanceMovement[]>();
  for (const row of movementRows) {
    const list = movementsByAccount.get(row.bank_account_id) ?? [];
    list.push({
      amount: Number(row.amount),
      at: new Date(row.transaction_at),
    });
    movementsByAccount.set(row.bank_account_id, list);
  }

  for (const bankAccountId of anchoredIds) {
    const anchor = anchorByAccount.get(bankAccountId)!;
    const derived = deriveBalanceFromAnchor({
      anchor,
      at,
      movements: movementsByAccount.get(bankAccountId) ?? [],
    });
    result.set(bankAccountId, derived.amount.toFixed(4));
  }

  return result;
}
