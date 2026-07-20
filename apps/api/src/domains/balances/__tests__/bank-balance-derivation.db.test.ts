import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getCurrencyId,
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { getBankAccountsWithDetails } from '../../banking/bankAccounts/bankAccounts.model.js';
import { deriveBankBalanceAt } from '../bank-balance-derivation.js';
import { bankBalanceService } from '../bank-balance.service.js';
import {
  updateBankCurrentBalance,
  updateProviderReportedBalance,
} from '../bank-current-balance.js';

describe('bank balance derivation (db)', () => {
  const createdAccountIds: string[] = [];

  afterEach(async () => {
    const db = getTestDb();
    if (createdAccountIds.length === 0) return;
    await db.transaction(async (trx) => {
      await trx.raw("SELECT set_config('app.demo_seed_teardown', 'on', true)");
      await trx('bank_transactions')
        .whereIn('bank_account_id', createdAccountIds)
        .delete();
      await trx('bank_transaction_batches')
        .whereIn('bank_account_id', createdAccountIds)
        .delete();
      await trx('bank_account_current_native_balances')
        .whereIn('bank_account_id', createdAccountIds)
        .delete();
      await trx('bank_account_daily_native_snapshots')
        .whereIn('bank_account_id', createdAccountIds)
        .delete();
      await trx('bank_account_opening_balances')
        .whereIn('bank_account_id', createdAccountIds)
        .delete();
      await trx('bank_accounts').whereIn('id', createdAccountIds).delete();
    });
    createdAccountIds.length = 0;
  });

  async function seedAccount() {
    const db = getTestDb();
    return db.transaction(async (trx) => {
      const companyId = await getTestCompanyId(trx, 'indDemoUS');
      const userId = await getTestUserId(trx, US_USER_EMAIL);
      const currencyId = await getCurrencyId(trx, 'USD');
      const bank = await trx('banks').first<{ id: string }>('id');
      const coa = await trx('coa')
        .where({ company_id: companyId })
        .first<{ id: string }>('id');
      if (!bank || !coa) throw new Error('Missing bank or coa fixture');

      const bankAccountId = randomUUID();
      createdAccountIds.push(bankAccountId);
      await trx('bank_accounts').insert({
        id: bankAccountId,
        company_id: companyId,
        bank_id: bank.id,
        currency_id: currencyId,
        coa_id: coa.id,
        display_name: 'Derivation Test Account',
        account_type: 'checkings_current',
        business_or_personal: 'personal',
        account_number_mask: '1234',
        created_by_id: userId,
        updated_by_id: userId,
      });

      return { companyId, userId, bankAccountId };
    });
  }

  it('uses the maintained current balance when no provider balance exists', async () => {
    const db = getTestDb();
    const { companyId, userId, bankAccountId } = await seedAccount();
    const [batch] = await db('bank_transaction_batches')
      .insert({
        bank_account_id: bankAccountId,
        company_id: companyId,
        start_date: '2026-01-10',
        end_date: '2026-01-12',
        source: 'manual_entry',
        fingerprint: randomUUID(),
        import_row_count: 2,
        created_by_id: userId,
      })
      .returning<{ id: string }[]>('id');
    await db('bank_transactions').insert([
      {
        company_id: companyId,
        bank_account_id: bankAccountId,
        bank_transaction_batch_id: batch!.id,
        amount: 1000,
        transaction_date: '2026-01-10',
        transaction_at: new Date('2026-01-10T12:00:00.000Z'),
        system_exchange_rate: 1,
        idempotency_key: randomUUID(),
        created_by_id: userId,
      },
      {
        company_id: companyId,
        bank_account_id: bankAccountId,
        bank_transaction_batch_id: batch!.id,
        amount: -250,
        transaction_date: '2026-01-12',
        transaction_at: new Date('2026-01-12T12:00:00.000Z'),
        system_exchange_rate: 1,
        idempotency_key: randomUUID(),
        created_by_id: userId,
      },
    ]);
    await bankBalanceService.recalculateBalance({
      companyId,
      bankAccountId,
      recalcFrom: '2026-01-10',
      recalcTo: '2026-01-12',
      triggeredBy: 'manual',
      userId,
    });

    const result = await getBankAccountsWithDetails(companyId);

    expect(
      result.data?.find((account) => account.id === bankAccountId)
        ?.recordedBankBalance,
    ).toBe('750.0000');
  });

  it('shows zero for an empty manual bank account', async () => {
    const { companyId, bankAccountId } = await seedAccount();

    const result = await getBankAccountsWithDetails(companyId);

    expect(
      result.data?.find((account) => account.id === bankAccountId)
        ?.recordedBankBalance,
    ).toBe('0.0000');
  });

  it('warms cold cache from transaction sum when native_balance is missing', async () => {
    const db = getTestDb();
    const { companyId, userId, bankAccountId } = await seedAccount();
    const [batch] = await db('bank_transaction_batches')
      .insert({
        bank_account_id: bankAccountId,
        company_id: companyId,
        start_date: '2026-03-01',
        end_date: '2026-03-02',
        source: 'manual_entry',
        fingerprint: randomUUID(),
        import_row_count: 2,
        created_by_id: userId,
      })
      .returning<{ id: string }[]>('id');
    await db('bank_transactions').insert([
      {
        company_id: companyId,
        bank_account_id: bankAccountId,
        bank_transaction_batch_id: batch!.id,
        amount: 400,
        transaction_date: '2026-03-01',
        transaction_at: new Date('2026-03-01T12:00:00.000Z'),
        system_exchange_rate: 1,
        idempotency_key: randomUUID(),
        created_by_id: userId,
      },
      {
        company_id: companyId,
        bank_account_id: bankAccountId,
        bank_transaction_batch_id: batch!.id,
        amount: -50,
        transaction_date: '2026-03-02',
        transaction_at: new Date('2026-03-02T12:00:00.000Z'),
        system_exchange_rate: 1,
        idempotency_key: randomUUID(),
        created_by_id: userId,
      },
    ]);

    const result = await getBankAccountsWithDetails(companyId);
    expect(
      result.data?.find((account) => account.id === bankAccountId)
        ?.recordedBankBalance,
    ).toBe('350.0000');

    const cached = await db('bank_account_current_native_balances')
      .where({ bank_account_id: bankAccountId })
      .first<{ native_balance: string }>('native_balance');
    expect(Number(cached?.native_balance)).toBe(350);
  });

  it('adds opening balance to post-OB transactions on cold cache', async () => {
    const db = getTestDb();
    const { companyId, userId, bankAccountId } = await seedAccount();
    const coverageStart = new Date('2026-02-02T00:00:00.000Z');
    await db('bank_account_opening_balances').insert({
      id: randomUUID(),
      bank_account_id: bankAccountId,
      amount: 1000,
      as_of_date: '2026-02-01',
      coverage_start: coverageStart,
      coverage_end: coverageStart,
      origin: 'user_entered',
      role: 'baseline',
      is_deleted: false,
      created_by_id: userId,
      updated_by_id: userId,
    });
    const [batch] = await db('bank_transaction_batches')
      .insert({
        bank_account_id: bankAccountId,
        company_id: companyId,
        start_date: '2026-02-05',
        end_date: '2026-02-05',
        source: 'manual_entry',
        fingerprint: randomUUID(),
        import_row_count: 1,
        created_by_id: userId,
      })
      .returning<{ id: string }[]>('id');
    await db('bank_transactions').insert({
      company_id: companyId,
      bank_account_id: bankAccountId,
      bank_transaction_batch_id: batch!.id,
      amount: 200,
      transaction_date: '2026-02-05',
      transaction_at: new Date('2026-02-05T12:00:00.000Z'),
      system_exchange_rate: 1,
      idempotency_key: randomUUID(),
      created_by_id: userId,
    });

    const result = await getBankAccountsWithDetails(companyId);
    // OB 1000 at coverage_start − 1ms + tx 200 after that → 1200
    expect(
      result.data?.find((account) => account.id === bankAccountId)
        ?.recordedBankBalance,
    ).toBe('1200.0000');
  });

  it('does not write system_calculated opening balances after backsolve', async () => {
    const db = getTestDb();
    const { companyId, userId, bankAccountId } = await seedAccount();
    await updateProviderReportedBalance({
      companyId,
      bankAccountId,
      balance: 500,
      asOf: new Date('2026-01-25T12:00:00.000Z'),
    });
    await db('bank_account_daily_native_snapshots').insert({
      company_id: companyId,
      bank_account_id: bankAccountId,
      day: '2026-01-20',
      opening_balance: 400,
      money_in: 100,
      money_out: 0,
      closing_balance: 500,
      transaction_count: 1,
    });

    await bankBalanceService.recalculateBalance({
      companyId,
      bankAccountId,
      recalcFrom: '2026-01-10',
      triggeredBy: 'manual',
      userId,
    });

    const systemCalculated = await db('bank_account_opening_balances')
      .where({
        bank_account_id: bankAccountId,
        origin: 'system_calculated',
        is_deleted: false,
      })
      .first();
    expect(systemCalculated).toBeUndefined();
  });

  it('keeps provider-reported balance after recalc overwrites the native cache', async () => {
    const db = getTestDb();
    const { companyId, userId, bankAccountId } = await seedAccount();
    const providerAsOf = new Date('2026-01-05T12:00:00.000Z');
    await updateProviderReportedBalance({
      companyId,
      bankAccountId,
      balance: 1234.5,
      asOf: providerAsOf,
    });

    await db('bank_account_daily_native_snapshots').insert({
      company_id: companyId,
      bank_account_id: bankAccountId,
      day: '2026-01-20',
      opening_balance: 100,
      money_in: 50,
      money_out: 0,
      closing_balance: 150,
      transaction_count: 1,
    });

    await bankBalanceService.recalculateBalance({
      companyId,
      bankAccountId,
      recalcFrom: '2026-01-10',
      triggeredBy: 'manual',
      userId,
    });

    const row = await db('bank_account_current_native_balances')
      .where({ bank_account_id: bankAccountId })
      .first<{
        native_balance: string | null;
        provider_reported_balance: string;
        provider_reported_at: Date;
      }>();

    expect(Number(row?.provider_reported_balance)).toBe(1234.5);
    expect(new Date(row!.provider_reported_at).toISOString()).toBe(
      providerAsOf.toISOString(),
    );
    // Recalc may write a computed native cache; it must not equal the provider
    // overwrite of the same column pair.
    expect(
      row?.native_balance == null || Number(row.native_balance) !== 1234.5,
    ).toBe(true);

    const derived = await deriveBankBalanceAt({
      companyId,
      bankAccountId,
      at: providerAsOf,
    });
    expect(derived?.amount).toBe(1234.5);
  });
});
