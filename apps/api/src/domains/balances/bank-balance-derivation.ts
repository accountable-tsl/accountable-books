import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';
import { updateBankCurrentBalance } from './bank-current-balance.js';
import {
  addDaysYmd,
  dateFromYmdUtc,
  ymdUtc,
} from './opening-balance/opening-balance.utils.js';

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
 * Returns null when no provider-reported balance exists (unknown is not zero).
 * Used for historical rebuild checkpoints — not the list "our records" path.
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

function openingBalanceToAnchor(row: {
  amount: string | number;
  as_of_date: Date | string;
  coverage_start: Date | string | null;
}): NativeBalanceAnchor {
  const amount = Number(row.amount);
  if (row.coverage_start) {
    return {
      amount,
      asOf: new Date(new Date(row.coverage_start).getTime() - 1),
    };
  }
  const asOfYmd =
    typeof row.as_of_date === 'string'
      ? row.as_of_date.slice(0, 10)
      : ymdUtc(row.as_of_date);
  return {
    amount,
    asOf: new Date(dateFromYmdUtc(addDaysYmd(asOfYmd, 1)).getTime() - 1),
  };
}

/**
 * Bank (our records) for the account list:
 * - connected with provider statement → provider ± txs since then
 * - else maintained native_balance cache (OB-or-0 + txs via recalc)
 * - cold cache → compute once, warm cache, return
 * - empty → 0
 *
 * Always returns a string amount for every requested id (never null).
 */
export async function getCurrentRecordedBankBalances({
  companyId,
  bankAccountIds,
  trx,
}: {
  companyId: string;
  bankAccountIds: string[];
  trx?: Knex.Transaction;
}): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (bankAccountIds.length === 0) return result;

  const client = trx ?? knexClient;
  const at = new Date();
  for (const id of bankAccountIds) {
    result.set(id, '0.0000');
  }

  const balanceRows = await client('bank_account_current_native_balances')
    .where({ company_id: companyId })
    .whereIn('bank_account_id', bankAccountIds)
    .select<
      {
        bank_account_id: string;
        native_balance: string | null;
        provider_reported_balance: string | null;
        provider_reported_at: Date | null;
      }[]
    >('bank_account_id', 'native_balance', 'provider_reported_balance', 'provider_reported_at');

  const providerAnchors = new Map<string, NativeBalanceAnchor>();
  const resolved = new Set<string>();

  for (const row of balanceRows) {
    if (
      row.provider_reported_balance !== null &&
      row.provider_reported_at !== null
    ) {
      providerAnchors.set(row.bank_account_id, {
        amount: Number(row.provider_reported_balance),
        asOf: new Date(row.provider_reported_at),
      });
    } else if (row.native_balance !== null) {
      result.set(row.bank_account_id, Number(row.native_balance).toFixed(4));
      resolved.add(row.bank_account_id);
    }
  }

  const anchoredIds = [...providerAnchors.keys()];
  if (anchoredIds.length > 0) {
    const minAsOf = Math.min(
      at.getTime(),
      ...[...providerAnchors.values()].map((anchor) => anchor.asOf.getTime()),
    );
    const maxAsOf = Math.max(
      at.getTime(),
      ...[...providerAnchors.values()].map((anchor) => anchor.asOf.getTime()),
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
      const anchor = providerAnchors.get(bankAccountId)!;
      const derived = deriveBalanceFromAnchor({
        anchor,
        at,
        movements: movementsByAccount.get(bankAccountId) ?? [],
      });
      result.set(bankAccountId, derived.amount.toFixed(4));
      resolved.add(bankAccountId);
    }
  }

  const coldIds = bankAccountIds.filter((id) => !resolved.has(id));
  if (coldIds.length === 0) return result;

  await warmColdRecordedBalances({
    companyId,
    bankAccountIds: coldIds,
    at,
    client,
    result,
  });

  return result;
}

/**
 * For accounts with no provider statement and no native_balance cache:
 * compute OB-or-0 + txs after OB (or all txs), write the cache, return amounts.
 */
async function warmColdRecordedBalances({
  companyId,
  bankAccountIds,
  at,
  client,
  result,
}: {
  companyId: string;
  bankAccountIds: string[];
  at: Date;
  client: Queryable;
  result: Map<string, string>;
}): Promise<void> {
  const openingRows = await client('bank_account_opening_balances as ob')
    .join('bank_accounts as ba', 'ba.id', 'ob.bank_account_id')
    .where({
      'ba.company_id': companyId,
      'ob.is_deleted': false,
      'ob.origin': 'user_entered',
      'ob.role': 'baseline',
    })
    .whereIn('ob.bank_account_id', bankAccountIds)
    .select<
      {
        bank_account_id: string;
        amount: string;
        as_of_date: Date | string;
        coverage_start: Date | string | null;
      }[]
    >('ob.bank_account_id', 'ob.amount', 'ob.as_of_date', 'ob.coverage_start');

  const openingByAccount = new Map<string, NativeBalanceAnchor>();
  for (const row of openingRows) {
    openingByAccount.set(row.bank_account_id, openingBalanceToAnchor(row));
  }

  const sumRows = await client('bank_transactions')
    .where({
      company_id: companyId,
      is_deleted: false,
    })
    .whereIn('bank_account_id', bankAccountIds)
    .groupBy('bank_account_id')
    .select<{ bank_account_id: string; total: string }[]>(
      'bank_account_id',
      client.raw('COALESCE(SUM(amount), 0)::text as total'),
    );

  const txnTotalByAccount = new Map(
    sumRows.map((row) => [row.bank_account_id, Number(row.total)]),
  );

  // When OB exists, only txs after the OB anchor apply on top of OB.
  const afterObEntries = await Promise.all(
    [...openingByAccount.entries()].map(async ([bankAccountId, anchor]) => {
      const row = await client('bank_transactions')
        .where({
          company_id: companyId,
          bank_account_id: bankAccountId,
          is_deleted: false,
        })
        .andWhere('transaction_at', '>', anchor.asOf)
        .andWhere('transaction_at', '<=', at)
        .first<{ total: string }>(
          client.raw('COALESCE(SUM(amount), 0)::text as total'),
        );
      return [bankAccountId, Number(row?.total ?? 0)] as const;
    }),
  );
  const afterObSums = new Map(afterObEntries);

  for (const bankAccountId of bankAccountIds) {
    const opening = openingByAccount.get(bankAccountId);
    const amount = opening
      ? opening.amount + (afterObSums.get(bankAccountId) ?? 0)
      : (txnTotalByAccount.get(bankAccountId) ?? 0);

    const formatted = amount.toFixed(4);
    result.set(bankAccountId, formatted);

    await updateBankCurrentBalance({
      companyId,
      bankAccountId,
      balance: amount,
      asOf: at,
      client,
    });
  }
}
