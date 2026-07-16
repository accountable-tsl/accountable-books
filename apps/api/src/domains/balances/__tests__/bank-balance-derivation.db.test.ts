import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getCurrencyId,
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
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
    await db('bank_account_current_native_balances')
      .whereIn('bank_account_id', createdAccountIds)
      .delete();
    await db('bank_account_daily_native_snapshots')
      .whereIn('bank_account_id', createdAccountIds)
      .delete();
    await db('bank_account_opening_balances')
      .whereIn('bank_account_id', createdAccountIds)
      .delete();
    await db('bank_accounts').whereIn('id', createdAccountIds).delete();
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

  it('returns null when no provider-reported anchor exists', async () => {
    const { companyId, bankAccountId } = await seedAccount();
    await updateBankCurrentBalance({
      companyId,
      bankAccountId,
      balance: 999,
      asOf: new Date('2026-01-15T00:00:00.000Z'),
    });
    const result = await deriveBankBalanceAt({
      companyId,
      bankAccountId,
      at: new Date('2026-01-15T00:00:00.000Z'),
    });
    expect(result).toBeNull();
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
