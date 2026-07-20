import { describe, expect, it } from 'vitest';

import {
  bankTransactionBatchInput,
  reverseBankTransactionBatchInput,
} from './bankTransactions.types.js';

const validTransaction = {
  transaction_date: new Date('2026-01-15'),
  amount: 100,
  bank_account_id: '019c0000-0000-7000-8000-000000000001',
};

describe('bankTransactionBatchInput', () => {
  it('rejects an empty transaction batch', () => {
    const result = bankTransactionBatchInput.safeParse({
      source: 'file_import',
      bank_account_id: validTransaction.bank_account_id,
      bank_transactions: [],
    });

    expect(result.success).toBe(false);
  });

  it('defaults source metadata to an empty object', () => {
    const result = bankTransactionBatchInput.parse({
      source: 'file_import',
      bank_account_id: validTransaction.bank_account_id,
      bank_transactions: [validTransaction],
    });

    expect(result.source_metadata).toEqual({});
  });

  it('accepts bank feed transactions without canonical idempotency keys', () => {
    const result = bankTransactionBatchInput.safeParse({
      source: 'bank_feed',
      bank_account_id: validTransaction.bank_account_id,
      bank_account_feed_id: '019c0000-0000-7000-8000-000000000002',
      bank_transactions: [validTransaction],
    });

    expect(result.success).toBe(true);
  });
});

describe('reverseBankTransactionBatchInput', () => {
  it('requires and trims a non-empty reversal reason', () => {
    expect(
      reverseBankTransactionBatchInput.parse({ reason: ' Wrong account ' }),
    ).toEqual({ reason: 'Wrong account' });
    expect(
      reverseBankTransactionBatchInput.safeParse({ reason: '   ' }).success,
    ).toBe(false);
  });
});
