import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../../config/test-db.js';
import { syncLedgerTransactionSignals } from './close-signals.sync.js';
import {
  createFixture,
  insertLedgerTransaction,
  insertMonthlyPeriod,
  type Fixture,
} from './signal-fixtures.js';

const SIGNALS_TABLE = 'close_review_signals';

describe('syncLedgerTransactionSignals', () => {
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

  function signalsFor(ledgerTransactionId: string) {
    return trx(SIGNALS_TABLE)
      .where('ledger_transaction_id', ledgerTransactionId)
      .select<{ code: string; fingerprint: string }[]>('code', 'fingerprint');
  }

  it('persists the evaluated signals for a transaction', async () => {
    const ledgerTransactionId = await insertLedgerTransaction(
      trx,
      fixture,
      { transactionSource: 'bank_transaction' },
      [
        { accountTypeKey: 'ca_bank', amount: 100, isBankLeg: true },
        { accountTypeKey: 'rev_revenue', amount: -100 },
      ],
    );

    const result = await syncLedgerTransactionSignals(ledgerTransactionId, trx);

    expect(result.persisted).toBe(1);
    expect(result.removed).toBe(0);
    const rows = await signalsFor(ledgerTransactionId);
    expect(rows.map((r) => r.code)).toEqual(['bank_offset_direct_to_revenue']);
  });

  it('is idempotent across repeated syncs', async () => {
    const ledgerTransactionId = await insertLedgerTransaction(
      trx,
      fixture,
      { transactionSource: 'bank_transaction' },
      [
        { accountTypeKey: 'ca_bank', amount: 100, isBankLeg: true },
        { accountTypeKey: 'rev_revenue', amount: -100 },
      ],
    );

    await syncLedgerTransactionSignals(ledgerTransactionId, trx);
    const second = await syncLedgerTransactionSignals(ledgerTransactionId, trx);

    expect(second.removed).toBe(0);
    const rows = await signalsFor(ledgerTransactionId);
    expect(rows).toHaveLength(1);
  });

  it('removes a stale signal that no longer fires while keeping current ones', async () => {
    const ledgerTransactionId = await insertLedgerTransaction(
      trx,
      fixture,
      { transactionSource: 'bank_transaction' },
      [
        { accountTypeKey: 'ca_bank', amount: 100, isBankLeg: true },
        { accountTypeKey: 'rev_revenue', amount: -100 },
      ],
    );

    await insertStaleSignal(trx, fixture, ledgerTransactionId, 'stale-fp-1');

    const result = await syncLedgerTransactionSignals(ledgerTransactionId, trx);

    expect(result.persisted).toBe(1);
    expect(result.removed).toBe(1);
    const codes = (await signalsFor(ledgerTransactionId)).map((r) => r.code);
    expect(codes).toEqual(['bank_offset_direct_to_revenue']);
  });

  it('removes all signals when the transaction now produces none', async () => {
    // An ordinary manual journal fires no signals.
    const ledgerTransactionId = await insertLedgerTransaction(
      trx,
      fixture,
      { transactionSource: 'manual_journal' },
      [
        { accountTypeKey: 'rev_revenue', amount: -100 },
        { accountTypeKey: 'exp_opex_rent', amount: 100 },
      ],
    );
    await insertStaleSignal(trx, fixture, ledgerTransactionId, 'stale-fp-2');

    const result = await syncLedgerTransactionSignals(ledgerTransactionId, trx);

    expect(result.persisted).toBe(0);
    expect(result.removed).toBe(1);
    expect(await signalsFor(ledgerTransactionId)).toHaveLength(0);
  });

  it('updates facts_hash in place for an existing fingerprint', async () => {
    const ledgerTransactionId = await insertLedgerTransaction(
      trx,
      fixture,
      { transactionSource: 'bank_transaction' },
      [
        { accountTypeKey: 'ca_bank', amount: 100, isBankLeg: true },
        { accountTypeKey: 'rev_revenue', amount: -100 },
      ],
    );

    await syncLedgerTransactionSignals(ledgerTransactionId, trx);
    // Tamper with the stored facts_hash, then re-sync: it should be corrected
    // without creating a duplicate row.
    await trx(SIGNALS_TABLE)
      .where('ledger_transaction_id', ledgerTransactionId)
      .update({ facts_hash: 'tampered' });

    await syncLedgerTransactionSignals(ledgerTransactionId, trx);

    const rows = await trx(SIGNALS_TABLE)
      .where('ledger_transaction_id', ledgerTransactionId)
      .select<{ facts_hash: string }[]>('facts_hash');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.facts_hash).not.toBe('tampered');
  });
});

/**
 * Insert a signal row directly so reconciliation has something to remove,
 * without depending on supersession mechanics. Satisfies the fiscal_calendar
 * and ledger_transaction composite FKs via the fixture's period and txn.
 */
async function insertStaleSignal(
  trx: Knex.Transaction,
  fixture: Fixture,
  ledgerTransactionId: string,
  fingerprint: string,
): Promise<void> {
  await trx('close_review_signals').insert({
    company_id: fixture.companyId,
    ledger_transaction_id: ledgerTransactionId,
    fiscal_year: 2026,
    period_number: 6,
    period_type: 'monthly',
    code: 'posted_to_fallback_account',
    fingerprint,
    facts_hash: 'stale-facts',
    details: JSON.stringify({}),
  });
}
