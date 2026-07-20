import { describe, expect, it } from 'vitest';

import {
  isWithinOverlapWindow,
  planReplacementMatches,
  toAmountKey,
} from '../replacement-reconciliation.js';

import type { ProviderTransaction } from '../../types/base.js';
import type { PredecessorPoolRow } from '../replacement-reconciliation.js';

function obs(id: string, date: string, amount: number): ProviderTransaction {
  return {
    transactionId: id,
    providerBankAccountId: 'acct',
    date,
    amount,
    description: 't',
    currencyCode: 'USD',
    pending: false,
    rawData: {},
  };
}

function pool(
  feedEntryId: string,
  bankTransactionId: string,
  dateYmd: string,
  amount: number,
): PredecessorPoolRow {
  return {
    feedEntryId,
    bankTransactionId,
    dateYmd,
    amountKey: toAmountKey(amount),
  };
}

describe('replacement reconciliation matching', () => {
  it('adopts exact 1:1 date+amount pairs and flags leftovers', () => {
    const plan = planReplacementMatches({
      unknownObservations: [
        obs('n1', '2026-01-15', 5),
        obs('n2', '2026-01-15', 5),
        obs('n3', '2026-01-15', 5),
      ],
      pool: [
        pool('e1', 't1', '2026-01-15', 5),
        pool('e2', 't2', '2026-01-15', 5),
      ],
      windowStartYmd: '2026-01-01',
      windowEndYmd: '2026-01-31',
    });

    expect(plan.adopts).toHaveLength(2);
    expect(plan.unmatchedImports.map((o) => o.transactionId)).toEqual(['n3']);
    expect(plan.passthrough).toHaveLength(0);
  });

  it('passes through observations outside the overlap window', () => {
    const plan = planReplacementMatches({
      unknownObservations: [obs('outside', '2025-06-01', 10)],
      pool: [pool('e1', 't1', '2026-01-15', 10)],
      windowStartYmd: '2026-01-01',
      windowEndYmd: '2026-01-31',
    });

    expect(plan.adopts).toHaveLength(0);
    expect(plan.unmatchedImports).toHaveLength(0);
    expect(plan.passthrough.map((o) => o.transactionId)).toEqual(['outside']);
  });

  it('treats empty window bounds as not-in-window', () => {
    expect(
      isWithinOverlapWindow({
        observedYmd: '2026-01-15',
        windowStartYmd: null,
        windowEndYmd: null,
      }),
    ).toBe(false);
  });
});
