import { describe, expect, it } from 'vitest';

import { deriveBalanceFromAnchor } from '../bank-balance-derivation.js';

describe('deriveBalanceFromAnchor', () => {
  const anchorAsOf = new Date('2026-01-15T12:00:00.000Z');
  const anchor = { amount: 1000, asOf: anchorAsOf };

  it('returns the anchor amount when at equals the anchor as-of', () => {
    const result = deriveBalanceFromAnchor({
      anchor,
      at: new Date(anchorAsOf),
      movements: [{ amount: 50, at: new Date('2026-01-10T00:00:00.000Z') }],
    });
    expect(result.amount).toBe(1000);
    expect(result.anchorAmount).toBe(1000);
  });

  it('walks backward: balance(D) = A − Σ (D, T]', () => {
    const result = deriveBalanceFromAnchor({
      anchor,
      at: new Date('2026-01-10T00:00:00.000Z'),
      movements: [
        { amount: 100, at: new Date('2026-01-12T00:00:00.000Z') },
        { amount: -40, at: new Date('2026-01-14T00:00:00.000Z') },
        // on/before D — excluded
        { amount: 999, at: new Date('2026-01-10T00:00:00.000Z') },
        // after T — excluded
        { amount: 999, at: new Date('2026-01-16T00:00:00.000Z') },
      ],
    });
    // 1000 - (100 + -40) = 940
    expect(result.amount).toBe(940);
  });

  it('walks forward: balance(D) = A + Σ (T, D]', () => {
    const result = deriveBalanceFromAnchor({
      anchor,
      at: new Date('2026-01-20T00:00:00.000Z'),
      movements: [
        { amount: 25, at: new Date('2026-01-16T00:00:00.000Z') },
        { amount: -10, at: new Date('2026-01-20T00:00:00.000Z') },
        // at/before T — excluded
        { amount: 999, at: new Date('2026-01-15T12:00:00.000Z') },
      ],
    });
    // 1000 + 25 + -10 = 1015
    expect(result.amount).toBe(1015);
  });

  it('treats positive amounts as money in when walking back', () => {
    const result = deriveBalanceFromAnchor({
      anchor: { amount: 500, asOf: new Date('2026-02-01T00:00:00.000Z') },
      at: new Date('2026-01-01T00:00:00.000Z'),
      movements: [{ amount: 200, at: new Date('2026-01-15T00:00:00.000Z') }],
    });
    expect(result.amount).toBe(300);
  });
});
