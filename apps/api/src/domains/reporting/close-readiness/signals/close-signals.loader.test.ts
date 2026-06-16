import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../../config/test-db.js';
import { loadLedgerTransactionForSignals } from './close-signals.loader.js';
import {
  attachDocument,
  createFixture,
  insertContact,
  insertLedgerTransaction,
  insertMonthlyPeriod,
  type Fixture,
} from './signal-fixtures.js';

describe('loadLedgerTransactionForSignals', () => {
  let trx: Knex.Transaction;
  let fixture: Fixture;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    fixture = await createFixture(trx);
    await insertMonthlyPeriod(trx, fixture, {
      fiscalYear: 2026,
      periodNumber: 6,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('maps a posted bank transaction into evaluator inputs', async () => {
    const ledgerTransactionId = await insertLedgerTransaction(
      trx,
      fixture,
      { transactionSource: 'bank_transaction', categorizationSource: 'manual' },
      [
        { accountTypeKey: 'ca_bank', amount: 100, isBankLeg: true },
        { accountTypeKey: 'rev_revenue', amount: -100 },
      ],
    );

    const loaded = await loadLedgerTransactionForSignals(
      ledgerTransactionId,
      trx,
    );

    expect(loaded).not.toBeNull();
    expect(loaded?.accountingBasis).toBe('modified_accrual_basis');
    expect(loaded?.txn.transactionSource).toBe('bank_transaction');
    expect(loaded?.txn.fiscalYear).toBe(2026);
    expect(loaded?.txn.periodNumber).toBe(6);
    expect(loaded?.txn.periodType).toBe('monthly');
    expect(loaded?.txn.hasSupportingDocument).toBe(false);
    expect(loaded?.entries).toHaveLength(2);

    const bankLeg = loaded?.entries.find((entry) => entry.isBankLeg);
    const revenueLeg = loaded?.entries.find((entry) => !entry.isBankLeg);
    expect(bankLeg?.accountTypeKey).toBe('ca_bank');
    expect(bankLeg?.accountElementKey).toBe('current_asset');
    expect(revenueLeg?.accountTypeKey).toBe('rev_revenue');
    expect(revenueLeg?.accountElementKey).toBe('revenue');
    expect(revenueLeg?.labelRole).toBeDefined();
    expect(Math.abs(revenueLeg?.amount ?? 0)).toBe(100);
  });

  it('returns null for a transaction that does not exist', async () => {
    const loaded = await loadLedgerTransactionForSignals(randomUUID(), trx);
    expect(loaded).toBeNull();
  });

  it('returns null when the transaction date has no fiscal period', async () => {
    // Posted in July, but only a June period exists.
    const ledgerTransactionId = await insertLedgerTransaction(
      trx,
      fixture,
      { transactionDate: '2026-07-10' },
      [
        { accountTypeKey: 'ca_bank', amount: 50, isBankLeg: true },
        { accountTypeKey: 'rev_revenue', amount: -50 },
      ],
    );

    const loaded = await loadLedgerTransactionForSignals(
      ledgerTransactionId,
      trx,
    );
    expect(loaded).toBeNull();
  });

  it('falls back to the transaction contact when a leg has none', async () => {
    const contactId = await insertContact(trx, fixture);
    const ledgerTransactionId = await insertLedgerTransaction(
      trx,
      fixture,
      { contactId },
      [
        { accountTypeKey: 'ca_bank', amount: 100, isBankLeg: true },
        { accountTypeKey: 'ca_trade_receivable', amount: -100, contactId: null },
      ],
    );

    const loaded = await loadLedgerTransactionForSignals(
      ledgerTransactionId,
      trx,
    );

    const receivableLeg = loaded?.entries.find(
      (entry) => entry.accountTypeKey === 'ca_trade_receivable',
    );
    expect(receivableLeg?.contactId).toBe(contactId);
  });

  it('detects a supporting document attached to the transaction', async () => {
    const ledgerTransactionId = await insertLedgerTransaction(
      trx,
      fixture,
      { transactionSource: 'manual_journal' },
      [
        { accountTypeKey: 'cl_trade_payable', amount: -100 },
        { accountTypeKey: 'exp_opex_rent', amount: 100 },
      ],
    );
    await attachDocument(trx, fixture, ledgerTransactionId);

    const loaded = await loadLedgerTransactionForSignals(
      ledgerTransactionId,
      trx,
    );
    expect(loaded?.txn.hasSupportingDocument).toBe(true);
  });

  it('passes through the categorization source', async () => {
    const ledgerTransactionId = await insertLedgerTransaction(
      trx,
      fixture,
      { categorizationSource: 'ml' },
      [
        { accountTypeKey: 'ca_bank', amount: 100, isBankLeg: true },
        { accountTypeKey: 'rev_revenue', amount: -100 },
      ],
    );

    const loaded = await loadLedgerTransactionForSignals(
      ledgerTransactionId,
      trx,
    );
    expect(loaded?.txn.categorizationSource).toBe('ml');
  });
});
