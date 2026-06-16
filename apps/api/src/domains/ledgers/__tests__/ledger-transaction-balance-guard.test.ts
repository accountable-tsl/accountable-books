import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';

type BalanceGuardFixture = {
  companyId: string;
  userId: string;
  currencyId: string;
  cashCoaId: string;
  expenseCoaId: string;
};

describe('ledger transaction balance guard', () => {
  let trx: Knex.Transaction;
  let fixture: BalanceGuardFixture;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    fixture = await createFixture(trx);
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('rejects unbalanced ledger transactions before commit', async () => {
    const ledgerTransactionId = await insertLedgerTransactionDirectly({
      trx,
      fixture,
    });
    await insertLedgerEntryDirectly({
      trx,
      fixture,
      ledgerTransactionId,
      coaId: fixture.cashCoaId,
      sourceAmount: 100,
    });
    await insertLedgerEntryDirectly({
      trx,
      fixture,
      ledgerTransactionId,
      coaId: fixture.expenseCoaId,
      sourceAmount: -90,
    });

    await expect(trx.raw('SET CONSTRAINTS ALL IMMEDIATE')).rejects.toThrow(
      /entries must balance/,
    );
  });

  it('allows balanced ledger transactions inserted through direct paths', async () => {
    const ledgerTransactionId = await insertLedgerTransactionDirectly({
      trx,
      fixture,
    });
    await insertLedgerEntryDirectly({
      trx,
      fixture,
      ledgerTransactionId,
      coaId: fixture.cashCoaId,
      sourceAmount: 100,
    });
    await insertLedgerEntryDirectly({
      trx,
      fixture,
      ledgerTransactionId,
      coaId: fixture.expenseCoaId,
      sourceAmount: -100,
    });

    await expect(trx.raw('SET CONSTRAINTS ALL IMMEDIATE')).resolves.toBeTruthy();
  });
});

async function createFixture(
  trx: Knex.Transaction,
): Promise<BalanceGuardFixture> {
  const [user] = await trx('users')
    .insert({
      firstname: 'Ledger',
      lastname: 'Balance Guard',
      email: `ledger-balance-guard-${randomUUID()}@example.com`,
      user_type: 'regular',
    })
    .returning<{ id: string }[]>('id');
  if (!user) throw new Error('Failed to create ledger balance guard user');

  const currency = await trx('currencies')
    .where({ code: 'USD' })
    .select<{ id: string }[]>('id')
    .first();
  const country = await trx('countries')
    .where({ code: 'US' })
    .select<{ id: string }[]>('id')
    .first();
  if (!currency || !country) {
    throw new Error('Required currency or country bootstrap rows not found');
  }

  const [company] = await trx('companies')
    .insert({
      legal_name: 'Ledger Balance Guard Company',
      short_code: `lbg-${randomUUID().slice(0, 8)}`,
      type: 'business',
      year_end_day: 31,
      year_end_month: 12,
      accounting_basis: 'modified_accrual_basis',
      country_id: country.id,
      reporting_currency_id: currency.id,
      created_by_id: user.id,
    })
    .returning<{ id: string }[]>('id');
  if (!company) throw new Error('Failed to create ledger balance guard company');

  const accountTypes = await getAccountTypeIds(trx, [
    'ca_bank',
    'exp_opex_office_supplies',
  ]);

  const [cashCoa] = await trx('coa')
    .insert({
      company_id: company.id,
      account_type_id: accountTypes.ca_bank,
      currency_id: currency.id,
      name: 'Operating Cash',
      code: '1000',
      created_by_id: user.id,
    })
    .returning<{ id: string }[]>('id');
  const [expenseCoa] = await trx('coa')
    .insert({
      company_id: company.id,
      account_type_id: accountTypes.exp_opex_office_supplies,
      currency_id: currency.id,
      name: 'Office Supplies',
      code: '6100',
      created_by_id: user.id,
    })
    .returning<{ id: string }[]>('id');
  if (!cashCoa || !expenseCoa) {
    throw new Error('Failed to create ledger balance guard COAs');
  }

  return {
    companyId: company.id,
    userId: user.id,
    currencyId: currency.id,
    cashCoaId: cashCoa.id,
    expenseCoaId: expenseCoa.id,
  };
}

async function getAccountTypeIds(
  trx: Knex.Transaction,
  keys: string[],
): Promise<Record<string, string>> {
  const rows = await trx('account_types')
    .whereIn('key', keys)
    .select('id', 'key');
  const idsByKey = Object.fromEntries(
    rows.map((row: { id: string; key: string }) => [row.key, row.id]),
  );

  for (const key of keys) {
    if (!idsByKey[key]) {
      throw new Error(`Required account type bootstrap row not found: ${key}`);
    }
  }

  return idsByKey;
}

async function insertLedgerTransactionDirectly({
  trx,
  fixture,
}: {
  trx: Knex.Transaction;
  fixture: BalanceGuardFixture;
}): Promise<string> {
  const [ledgerTransaction] = await trx('ledger_transactions')
    .insert({
      company_id: fixture.companyId,
      transaction_date: '2025-01-15',
      transaction_source: 'manual_journal',
      categorization_source: 'manual',
      source_transaction_id: randomUUID(),
      source_transaction_currency_id: fixture.currencyId,
      created_by_id: fixture.userId,
      updated_by_id: fixture.userId,
    })
    .returning<{ id: string }[]>('id');
  if (!ledgerTransaction) {
    throw new Error('Failed to create direct ledger transaction');
  }

  return ledgerTransaction.id;
}

async function insertLedgerEntryDirectly({
  trx,
  fixture,
  ledgerTransactionId,
  coaId,
  sourceAmount,
}: {
  trx: Knex.Transaction;
  fixture: BalanceGuardFixture;
  ledgerTransactionId: string;
  coaId: string;
  sourceAmount: number;
}): Promise<void> {
  await trx('ledger_entries').insert({
    company_id: fixture.companyId,
    ledger_transaction_id: ledgerTransactionId,
    fs_date: '2025-01-15',
    coa_id: coaId,
    source_currency_id: fixture.currencyId,
    source_amount: sourceAmount,
    system_exchange_rate: 1,
    custom_exchange_rate: 1,
    description: 'Direct ledger insert',
    is_bank_leg: false,
    is_monetary: false,
    updated_by_id: fixture.userId,
  });
}
