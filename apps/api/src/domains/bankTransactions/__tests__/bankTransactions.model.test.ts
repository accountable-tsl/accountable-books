import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  deleteBankTransactions,
  reverseBankTransactionBatch,
} from '../bankTransactions.model.js';

type Fixture = {
  companyId: string;
  userId: string;
  currencyId: string;
  bankAccountId: string;
  batchId: string;
  bankTransactionId: string;
};

describe('bank transaction deletion guardrails', () => {
  let trx: Knex.Transaction;
  let fixture: Fixture;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    fixture = await createPostedBankTransactionFixture(trx);
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('blocks deleting a bank transaction that is linked to a posted ledger transaction', async () => {
    const result = await deleteBankTransactions({
      companyId: fixture.companyId,
      userId: fixture.userId,
      input: {
        bankTransactionIds: [fixture.bankTransactionId],
        reason: 'Imported into wrong account',
      },
      trx,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain(
      'Cannot delete bank transactions that have posted ledger transactions',
    );

    const bankTransaction = await trx('bank_transactions')
      .where({ id: fixture.bankTransactionId })
      .first('is_deleted');
    expect(bankTransaction.is_deleted).toBe(false);
  });

  it('blocks reversing a batch that contains a bank transaction linked to a posted ledger transaction', async () => {
    const result = await reverseBankTransactionBatch({
      companyId: fixture.companyId,
      userId: fixture.userId,
      batchId: fixture.batchId,
      input: { reason: 'Wrong import file' },
      trx,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain(
      'Cannot reverse a bank transaction batch containing transactions that have posted ledger transactions',
    );

    const batch = await trx('bank_transaction_batches')
      .where({ id: fixture.batchId })
      .first('status');
    expect(batch.status).toBe('active');
  });
});

async function createPostedBankTransactionFixture(
  trx: Knex.Transaction,
): Promise<Fixture> {
  const [user] = await trx('users')
    .insert({
      firstname: 'Bank',
      lastname: 'Guard Tester',
      email: `bank-guard-${randomUUID()}@example.com`,
      user_type: 'regular',
    })
    .returning<{ id: string }[]>('id');
  if (!user) throw new Error('Failed to create bank guard test user');

  const usd = await trx('currencies')
    .where({ code: 'USD' })
    .select<{ id: string }[]>('id')
    .first();
  const country = await trx('countries')
    .where({ code: 'US' })
    .select<{ id: string }[]>('id')
    .first();
  const bank = await trx('banks').select<{ id: string }[]>('id').first();
  if (!usd || !country || !bank) {
    throw new Error('Required bootstrap rows not found');
  }

  const [company] = await trx('companies')
    .insert({
      legal_name: 'Bank Guard Test Company',
      short_code: `bguard-${randomUUID().slice(0, 8)}`,
      type: 'business',
      year_end_day: 31,
      year_end_month: 12,
      accounting_basis: 'modified_accrual_basis',
      country_id: country.id,
      reporting_currency_id: usd.id,
      created_by_id: user.id,
    })
    .returning<{ id: string }[]>('id');
  if (!company) throw new Error('Failed to create bank guard test company');

  const accountType = await trx('account_types')
    .where({ key: 'ca_bank' })
    .select<{ id: string }[]>('id')
    .first();
  if (!accountType) throw new Error('Required bank account type not found');

  const [coa] = await trx('coa')
    .insert({
      company_id: company.id,
      account_type_id: accountType.id,
      currency_id: usd.id,
      name: 'Operating Cash',
      code: '1000',
      created_by_id: user.id,
    })
    .returning<{ id: string }[]>('id');
  if (!coa) throw new Error('Failed to create bank guard COA');

  const [bankAccount] = await trx('bank_accounts')
    .insert({
      company_id: company.id,
      display_name: 'Operating Account',
      account_name: 'Operating Account',
      account_type: 'checkings_current',
      account_number: randomUUID(),
      account_number_mask: '4242',
      business_or_personal: 'business',
      bank_id: bank.id,
      currency_id: usd.id,
      coa_id: coa.id,
      connection_status: 'not_connected',
      created_by_id: user.id,
    })
    .returning<{ id: string }[]>('id');
  if (!bankAccount) throw new Error('Failed to create bank guard account');

  const [batch] = await trx('bank_transaction_batches')
    .insert({
      bank_account_id: bankAccount.id,
      company_id: company.id,
      start_date: '2025-01-15',
      end_date: '2025-01-15',
      source: 'manual_entry',
      fingerprint: randomUUID(),
      import_row_count: 1,
      created_by_id: user.id,
    })
    .returning<{ id: string }[]>('id');
  if (!batch) throw new Error('Failed to create bank guard batch');

  const [bankTransaction] = await trx('bank_transactions')
    .insert({
      bank_account_id: bankAccount.id,
      company_id: company.id,
      bank_transaction_batch_id: batch.id,
      transaction_date: '2025-01-15',
      transaction_at: new Date('2025-01-15T12:00:00Z'),
      amount: 125,
      description: 'Customer receipt',
      system_exchange_rate: 1,
      idempotency_key: randomUUID(),
      created_by_id: user.id,
    })
    .returning<{ id: string }[]>('id');
  if (!bankTransaction) {
    throw new Error('Failed to create bank guard transaction');
  }

  const [ledgerTransaction] = await trx('ledger_transactions')
    .insert({
      company_id: company.id,
      transaction_date: '2025-01-15',
      transaction_source: 'bank_transaction',
      categorization_source: 'manual',
      description: 'Customer receipt',
      source_transaction_id: bankTransaction.id,
      source_transaction_date: '2025-01-15',
      source_transaction_amount: 125,
      source_transaction_currency_id: usd.id,
      created_by_id: user.id,
    })
    .returning<{ id: string }[]>('id');
  if (!ledgerTransaction) {
    throw new Error('Failed to create linked ledger transaction');
  }

  await trx('bank_transactions')
    .where({ id: bankTransaction.id })
    .update({ ledger_transaction_id: ledgerTransaction.id });

  return {
    companyId: company.id,
    userId: user.id,
    currencyId: usd.id,
    bankAccountId: bankAccount.id,
    batchId: batch.id,
    bankTransactionId: bankTransaction.id,
  };
}
