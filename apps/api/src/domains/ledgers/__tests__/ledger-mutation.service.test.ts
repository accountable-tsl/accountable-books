import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getCurrencyId,
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { OUTBOX_INTENT } from '../../outbox/intents.js';
import { setCompanySettings } from '../../settings/settings.service.js';
import { buildScopeKey } from '../../work/work.types.js';
import { postLedgerTransactions } from '../ledger-mutation.service.js';

describe('postLedgerTransactions - persist', () => {
  let trx: Knex.Transaction;
  let trxRolledBack = false;
  let testCompanyId: string;
  let testUserId: string;
  let testCurrencyId: string;
  let testCoaIds: { cash: string; expense: string };
  let testBankAccountId: string;

  async function createBankTransaction(
    amount: number,
    description: string,
    transactionDate = '2025-01-15',
  ) {
    const [batch] = await trx('bank_transaction_batches')
      .insert({
        bank_account_id: testBankAccountId,
        company_id: testCompanyId,
        start_date: transactionDate,
        end_date: transactionDate,
        source: 'manual_entry',
        fingerprint: randomUUID(),
        import_row_count: 1,
        created_by_id: testUserId,
      })
      .returning<{ id: string }[]>('id');

    const [bankTransaction] = await trx('bank_transactions')
      .insert({
        bank_account_id: testBankAccountId,
        company_id: testCompanyId,
        bank_transaction_batch_id: batch.id,
        transaction_date: transactionDate,
        transaction_at: new Date(`${transactionDate}T12:00:00Z`),
        amount,
        description,
        system_exchange_rate: 1,
        idempotency_key: randomUUID(),
        created_by_id: testUserId,
      })
      .returning('*');

    return bankTransaction;
  }

  function buildBankPostInput(
    bankTxn: { id: string; amount: number },
    fsDate: string,
  ) {
    const amount = Number(bankTxn.amount);
    return {
      transaction_date: fsDate,
      transaction_source: 'bank_transaction' as const,
      categorization_source: 'ml' as const,
      source_transaction_id: bankTxn.id,
      source_transaction_date: fsDate,
      source_transaction_amount: amount,
      source_transaction_currency_id: testCurrencyId,
      entries: [
        {
          fs_date: fsDate,
          coa_id: testCoaIds.cash,
          source_currency_id: testCurrencyId,
          source_amount: amount,
          description: 'Bank payment',
          is_bank_leg: true,
        },
        {
          fs_date: fsDate,
          coa_id: testCoaIds.expense,
          source_currency_id: testCurrencyId,
          source_amount: -amount,
          description: 'Bank payment',
        },
      ],
    };
  }

  async function enableFxTracking(): Promise<void> {
    const result = await setCompanySettings({
      companyId: testCompanyId,
      settings: [{ key: 'track_fx_positions', value: true }],
      userId: testUserId,
      trx,
    });
    expect(result.success).toBe(true);
  }

  async function ensureEurUsdExchangeRate(
    eurCurrencyId: string,
  ): Promise<void> {
    await trx('exchange_rates')
      .insert({
        rate_date: '2025-01-15',
        base_currency_id: eurCurrencyId,
        price_currency_id: testCurrencyId,
        rate: '1.1000000000',
        source: 'manual',
        provider: 'test',
      })
      .onConflict(['rate_date', 'base_currency_id', 'price_currency_id'])
      .merge(['rate', 'source', 'provider', 'updated_at']);
  }

  async function createJournalBatch(currencyId: string): Promise<string> {
    const [batch] = await trx('journal_batches')
      .insert({
        company_id: testCompanyId,
        date: '2025-01-15',
        title: 'FX test journal',
        currency_id: currencyId,
        exchange_rate: 1.1,
        status: 'draft',
        journal_source: 'one_off',
        created_by_id: testUserId,
        updated_by_id: testUserId,
      })
      .returning<{ id: string }[]>('id');
    if (!batch) {
      throw new Error('Failed to create journal batch for FX test');
    }
    return batch.id;
  }

  async function findCoaByAccountType(accountTypeKey: string): Promise<string> {
    const row = await trx('coa')
      .where({ company_id: testCompanyId })
      .join('account_types', 'coa.account_type_id', 'account_types.id')
      .where('account_types.key', accountTypeKey)
      .select('coa.id')
      .first();
    if (!row) {
      throw new Error(`Demo company missing COA for ${accountTypeKey}`);
    }
    return row.id;
  }

  function buildFxJournalPostInput(
    journalBatchId: string,
    eurCurrencyId: string,
    coaIds: { bank: string; receivable: string },
  ) {
    return {
      transaction_date: '2025-01-15',
      transaction_source: 'manual_journal' as const,
      categorization_source: 'manual' as const,
      source_transaction_id: journalBatchId,
      source_transaction_currency_id: eurCurrencyId,
      entries: [
        {
          fs_date: '2025-01-15',
          coa_id: coaIds.bank,
          source_currency_id: eurCurrencyId,
          source_amount: 1000,
          custom_exchange_rate: 1.1,
          description: 'EUR bank movement',
        },
        {
          fs_date: '2025-01-15',
          coa_id: coaIds.receivable,
          source_currency_id: eurCurrencyId,
          source_amount: -1000,
          custom_exchange_rate: 1.1,
          description: 'EUR receivable movement',
        },
      ],
    };
  }

  beforeEach(async () => {
    trxRolledBack = false;
    const db = getTestDb();
    trx = await db.transaction();

    testCompanyId = await getTestCompanyId(trx, 'bizDemoUS');
    testUserId = await getTestUserId(trx, US_USER_EMAIL);
    testCurrencyId = await getCurrencyId(trx, 'USD');

    const cashCoa = await trx('coa')
      .where({ company_id: testCompanyId })
      .join('account_types', 'coa.account_type_id', 'account_types.id')
      .where('account_types.key', 'ca_bank')
      .select('coa.id')
      .first();

    const expenseCoa = await trx('coa')
      .where({ company_id: testCompanyId })
      .join('account_types', 'coa.account_type_id', 'account_types.id')
      .where('account_types.key', 'exp_opex_office_supplies')
      .select('coa.id')
      .first();

    if (!cashCoa || !expenseCoa) {
      throw new Error('Demo company missing required COAs');
    }

    testCoaIds = { cash: cashCoa.id, expense: expenseCoa.id };

    const bankAccount = await trx('bank_accounts')
      .where({ company_id: testCompanyId, is_deleted: false })
      .first();

    if (!bankAccount) {
      throw new Error('Demo company missing bank account');
    }

    testBankAccountId = bankAccount.id;
    testCoaIds.cash = bankAccount.coa_id;
  });

  afterEach(async () => {
    if (!trxRolledBack) {
      await trx.rollback();
    }
  });

  it('posts a bank transaction to ledger_transactions and ledger_entries', async () => {
    const bankTxn = await createBankTransaction(-500, 'Bank payment');

    const result = await postLedgerTransactions({
      companyId: testCompanyId,
      actor: { type: 'user', userId: testUserId },
      requestContext: { source: 'api' },
      transactions: [buildBankPostInput(bankTxn, '2025-01-15')],
      trx,
    });

    expect(result.success).toBe(true);
    expect(result.data?.postedCount).toBe(1);
    expect(result.data?.ledgerTransactionIds).toHaveLength(1);

    const ledgerTransactionId = result.data!.ledgerTransactionIds[0]!;

    const header = await trx('ledger_transactions')
      .where({ id: ledgerTransactionId })
      .first();
    expect(header?.status).toBe('posted');
    expect(header?.source_transaction_id).toBe(bankTxn.id);
    expect(header?.company_id).toBe(testCompanyId);

    const entries = await trx('ledger_entries').where({
      ledger_transaction_id: ledgerTransactionId,
    });
    expect(entries).toHaveLength(2);

    const bankLeg = entries.find((e) => e.is_bank_leg);
    expect(bankLeg?.contact_id).toBeNull();
    expect(bankLeg?.coa_id).toBe(testCoaIds.cash);

    const bankTxnAfter = await trx('bank_transactions')
      .where({ id: bankTxn.id })
      .first();
    expect(bankTxnAfter?.ledger_transaction_id).toBe(ledgerTransactionId);

    const auditRow = await trx('audit_events')
      .where({
        company_id: testCompanyId,
        entity_type: 'ledger',
        entity_id: ledgerTransactionId,
        action: 'ledger.post',
      })
      .first();
    expect(auditRow).toBeTruthy();
    expect(auditRow?.actor_type).toBe('user');
    expect(auditRow?.user_id).toBe(testUserId);
    expect(auditRow?.payload).toMatchObject({
      transactionSource: 'bank_transaction',
      categorizationSource: 'ml',
      sourceTransactionId: bankTxn.id,
      transactionDate: '2025-01-15',
      sourceTransactionAmount: -500,
      isFx: false,
      entries: [
        {
          coaId: testCoaIds.cash,
          sourceAmount: -500,
          fsDate: '2025-01-15',
          isBankLeg: true,
          contactId: null,
        },
        {
          coaId: testCoaIds.expense,
          sourceAmount: 500,
          fsDate: '2025-01-15',
          isBankLeg: false,
          contactId: null,
        },
      ],
    });

    const glIntents = await trx('app.outbox')
      .where({
        intent_type: OUTBOX_INTENT.GL_BALANCE_RECALC_REQUESTED,
        status: 'pending',
      })
      .whereRaw("payload->>'companyId' = ?", [testCompanyId]);
    expect(glIntents).toHaveLength(2);
    const cashGl = glIntents.find(
      (row) => (row.payload as { coaId: string }).coaId === testCoaIds.cash,
    );
    const expenseGl = glIntents.find(
      (row) => (row.payload as { coaId: string }).coaId === testCoaIds.expense,
    );
    expect(cashGl?.payload).toMatchObject({
      companyId: testCompanyId,
      recalcFrom: '2025-01-15',
      triggeredBy: 'ledger_entry',
    });
    expect(expenseGl?.payload).toMatchObject({
      companyId: testCompanyId,
      recalcFrom: '2025-01-15',
      triggeredBy: 'ledger_entry',
    });

    const closeIntent = await trx('app.outbox')
      .where({
        intent_type: OUTBOX_INTENT.CLOSE_SIGNAL_EVAL_REQUESTED,
        scope_key: `${OUTBOX_INTENT.CLOSE_SIGNAL_EVAL_REQUESTED}:${testCompanyId}:${ledgerTransactionId}`,
        status: 'pending',
      })
      .first();
    expect(closeIntent?.payload).toMatchObject({
      companyId: testCompanyId,
      ledgerTransactionId,
      triggeredBy: 'ledger_write',
    });

    const materializationScopeKey = buildScopeKey({
      type: 'bank_account',
      clientCompanyId: testCompanyId,
      bankAccountId: testBankAccountId,
    });
    const materializationIntent = await trx('app.outbox')
      .where({
        intent_type: OUTBOX_INTENT.WORK_MATERIALIZATION_REQUESTED,
        scope_key: materializationScopeKey,
        status: 'pending',
      })
      .first();
    expect(materializationIntent?.payload).toMatchObject({
      scope: {
        type: 'bank_account',
        clientCompanyId: testCompanyId,
        bankAccountId: testBankAccountId,
      },
      change: {
        type: 'bank_transactions_posted',
        bankTransactionIds: [bankTxn.id],
      },
    });
  });

  it('merges GL recalc bounds across a batch onto one pending intent per COA', async () => {
    const bankTxnA = await createBankTransaction(
      -100,
      'Payment A',
      '2025-01-10',
    );
    const bankTxnB = await createBankTransaction(
      -200,
      'Payment B',
      '2025-01-20',
    );

    const result = await postLedgerTransactions({
      companyId: testCompanyId,
      actor: { type: 'user', userId: testUserId },
      requestContext: { source: 'api' },
      transactions: [
        buildBankPostInput(bankTxnA, '2025-01-10'),
        buildBankPostInput(bankTxnB, '2025-01-20'),
      ],
      trx,
    });

    expect(result.success).toBe(true);
    expect(result.data?.postedCount).toBe(2);

    const glIntents = await trx('app.outbox')
      .where({
        intent_type: OUTBOX_INTENT.GL_BALANCE_RECALC_REQUESTED,
        status: 'pending',
      })
      .whereRaw("payload->>'companyId' = ?", [testCompanyId]);
    expect(glIntents).toHaveLength(2);

    const cashGl = glIntents.find(
      (row) => (row.payload as { coaId: string }).coaId === testCoaIds.cash,
    );
    expect(cashGl?.payload).toMatchObject({
      recalcFrom: '2025-01-10',
      triggeredBy: 'ledger_entry',
    });

    const closeIntents = await trx('app.outbox')
      .where({
        intent_type: OUTBOX_INTENT.CLOSE_SIGNAL_EVAL_REQUESTED,
        status: 'pending',
      })
      .whereRaw("payload->>'companyId' = ?", [testCompanyId]);
    expect(closeIntents).toHaveLength(2);
  });

  it('writes no committed outbox rows when the posting transaction rolls back', async () => {
    const bankTxn = await createBankTransaction(-75, 'Rollback test');

    const result = await postLedgerTransactions({
      companyId: testCompanyId,
      actor: { type: 'user', userId: testUserId },
      requestContext: { source: 'api' },
      transactions: [buildBankPostInput(bankTxn, '2025-01-15')],
      trx,
    });
    expect(result.success).toBe(true);

    const scopeKey = `${OUTBOX_INTENT.GL_BALANCE_RECALC_REQUESTED}:${testCompanyId}:${testCoaIds.cash}`;

    expect(
      await trx('app.outbox')
        .where({ scope_key: scopeKey, status: 'pending' })
        .first(),
    ).toBeTruthy();

    await trx.rollback();
    trxRolledBack = true;

    expect(
      await getTestDb()('app.outbox').where({ scope_key: scopeKey }).first(),
    ).toBeUndefined();
  });

  it('does not create FX positions when tracking is disabled', async () => {
    const eurCurrencyId = await getCurrencyId(trx, 'EUR');
    await ensureEurUsdExchangeRate(eurCurrencyId);
    const journalBatchId = await createJournalBatch(eurCurrencyId);
    const receivableCoaId = await findCoaByAccountType('ca_trade_receivable');

    const result = await postLedgerTransactions({
      companyId: testCompanyId,
      actor: { type: 'user', userId: testUserId },
      requestContext: { source: 'api' },
      transactions: [
        buildFxJournalPostInput(journalBatchId, eurCurrencyId, {
          bank: testCoaIds.cash,
          receivable: receivableCoaId,
        }),
      ],
      trx,
    });

    expect(result.success).toBe(true);
    expect(
      await trx('fx_positions').where({ company_id: testCompanyId }),
    ).toHaveLength(0);
  });

  it('creates FX positions from re-read ledger entries when tracking is enabled', async () => {
    await enableFxTracking();
    const eurCurrencyId = await getCurrencyId(trx, 'EUR');
    await ensureEurUsdExchangeRate(eurCurrencyId);
    const journalBatchId = await createJournalBatch(eurCurrencyId);
    const receivableCoaId = await findCoaByAccountType('ca_trade_receivable');

    const result = await postLedgerTransactions({
      companyId: testCompanyId,
      actor: { type: 'user', userId: testUserId },
      requestContext: { source: 'api' },
      transactions: [
        buildFxJournalPostInput(journalBatchId, eurCurrencyId, {
          bank: testCoaIds.cash,
          receivable: receivableCoaId,
        }),
      ],
      trx,
    });

    expect(result.success).toBe(true);
    const ledgerTransactionId = result.data!.ledgerTransactionIds[0]!;

    const positions = await trx('fx_positions')
      .where({ company_id: testCompanyId })
      .orderBy('account_id');
    expect(positions).toHaveLength(2);
    expect(
      new Set(positions.map((position) => position.fx_transaction_id)).size,
    ).toBe(1);
    expect(positions[0]?.fx_transaction_id).toMatch(/^LEDGER_TX:/);

    const ledgerEntries = await trx('ledger_entries')
      .where({ ledger_transaction_id: ledgerTransactionId })
      .orderBy('coa_id');
    expect(ledgerEntries).toHaveLength(2);

    const movements = await trx('fx_position_movements')
      .where({ company_id: testCompanyId })
      .orderBy('ledger_entry_id');
    expect(movements).toHaveLength(2);

    for (const movement of movements) {
      const entry = ledgerEntries.find(
        (row) => row.id === movement.ledger_entry_id,
      );
      expect(entry).toBeDefined();
      expect(movement.source_type).toBe('ledger_entry');
      expect(movement.ledger_transaction_id).toBe(ledgerTransactionId);
      expect(Number(movement.foreign_amount_delta)).toBe(
        Number(entry!.source_amount),
      );
      expect(Number(movement.base_amount_delta)).toBe(Number(entry!.amount));
    }
  });

  it('does not create FX positions for domestic transactions even when tracking is enabled', async () => {
    await enableFxTracking();
    const bankTxn = await createBankTransaction(-125, 'Domestic FX tracking');

    const result = await postLedgerTransactions({
      companyId: testCompanyId,
      actor: { type: 'user', userId: testUserId },
      requestContext: { source: 'api' },
      transactions: [buildBankPostInput(bankTxn, '2025-01-15')],
      trx,
    });

    expect(result.success).toBe(true);
    expect(
      await trx('fx_positions').where({ company_id: testCompanyId }),
    ).toHaveLength(0);
  });

  it('rolls back FX positions when the posting transaction rolls back', async () => {
    await enableFxTracking();
    const eurCurrencyId = await getCurrencyId(trx, 'EUR');
    await ensureEurUsdExchangeRate(eurCurrencyId);
    const journalBatchId = await createJournalBatch(eurCurrencyId);
    const receivableCoaId = await findCoaByAccountType('ca_trade_receivable');

    const result = await postLedgerTransactions({
      companyId: testCompanyId,
      actor: { type: 'user', userId: testUserId },
      requestContext: { source: 'api' },
      transactions: [
        buildFxJournalPostInput(journalBatchId, eurCurrencyId, {
          bank: testCoaIds.cash,
          receivable: receivableCoaId,
        }),
      ],
      trx,
    });
    expect(result.success).toBe(true);

    expect(
      await trx('fx_positions').where({ company_id: testCompanyId }),
    ).toHaveLength(2);

    await trx.rollback();
    trxRolledBack = true;

    expect(
      await getTestDb()('fx_positions').where({ company_id: testCompanyId }),
    ).toHaveLength(0);
  });
});
