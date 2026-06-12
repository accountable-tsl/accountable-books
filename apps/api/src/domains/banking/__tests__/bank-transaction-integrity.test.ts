import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getCountryId,
  getCurrencyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';

interface CompanyFixture {
  id: string;
  coaId: string;
  credentialId: string;
  bankAccountId: string;
  batchId: string;
}

interface Fixture {
  userId: string;
  providerId: string;
  bankId: string;
  currencyId: string;
  companyA: CompanyFixture;
  companyB: CompanyFixture;
}

describe('banking database integrity', () => {
  let trx: Knex.Transaction;
  let fixture: Fixture;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    await trx.raw('SET LOCAL search_path TO app, public');
    fixture = await createFixture(trx);
  });

  afterEach(async () => {
    if (trx) await trx.rollback();
  });

  it('rejects a provider-connected bank account when the credential belongs to a different company', async () => {
    await expectForeignKeyViolation(
      insertBankAccount(trx, {
        bankId: fixture.bankId,
        companyId: fixture.companyB.id,
        connectionCredentialId: fixture.companyA.credentialId,
        coaId: fixture.companyB.coaId,
        currencyId: fixture.currencyId,
        providerId: fixture.providerId,
        userId: fixture.userId,
      }),
      'bank_accounts_credential_company_provider_fk',
    );
  });

  it('rejects an import batch when the bank account belongs to a different company', async () => {
    await expectForeignKeyViolation(
      insertBatch(trx, {
        bankAccountId: fixture.companyA.bankAccountId,
        companyId: fixture.companyB.id,
        connectionCredentialId: null,
        source: 'manual_entry',
        userId: fixture.userId,
      }),
      'bank_transaction_batches_account_company_fk',
    );
  });

  it('rejects a bank-feed batch when the credential belongs to a different company', async () => {
    await expectForeignKeyViolation(
      insertBatch(trx, {
        bankAccountId: fixture.companyA.bankAccountId,
        companyId: fixture.companyA.id,
        connectionCredentialId: fixture.companyB.credentialId,
        source: 'bank_feed',
        userId: fixture.userId,
      }),
      'bank_transaction_batches_credential_company_fk',
    );
  });

  it('rejects a transaction when company_id does not match the bank account and batch tuple', async () => {
    await expectForeignKeyViolation(
      insertTransaction(trx, {
        bankAccountId: fixture.companyA.bankAccountId,
        bankTransactionBatchId: fixture.companyA.batchId,
        companyId: fixture.companyB.id,
        userId: fixture.userId,
      }),
    );
  });

  it('rejects a transaction when the batch belongs to a different bank account/company tuple', async () => {
    await expectForeignKeyViolation(
      insertTransaction(trx, {
        bankAccountId: fixture.companyA.bankAccountId,
        bankTransactionBatchId: fixture.companyB.batchId,
        companyId: fixture.companyA.id,
        userId: fixture.userId,
      }),
      'bank_transactions_batch_account_company_fk',
    );
  });

  it('accepts a transaction when company, bank account, and batch are consistent', async () => {
    const transactionId = await insertTransaction(trx, {
      bankAccountId: fixture.companyA.bankAccountId,
      bankTransactionBatchId: fixture.companyA.batchId,
      companyId: fixture.companyA.id,
      userId: fixture.userId,
    });

    expect(transactionId).toEqual(expect.any(String));
  });
});

async function createFixture(trx: Knex.Transaction): Promise<Fixture> {
  const userId = await getTestUserId(trx, US_USER_EMAIL);
  const countryId = await getCountryId(trx, 'US');
  const currencyId = await getCurrencyId(trx, 'USD');
  const providerId = await ensureProvider(trx, userId);
  const bankId = await ensureBank(trx, { countryId, userId });

  const companyA = await createCompanyFixture(trx, {
    bankId,
    currencyId,
    label: 'a',
    providerId,
    userId,
  });
  const companyB = await createCompanyFixture(trx, {
    bankId,
    currencyId,
    label: 'b',
    providerId,
    userId,
  });

  return {
    bankId,
    companyA,
    companyB,
    currencyId,
    providerId,
    userId,
  };
}

async function createCompanyFixture(
  trx: Knex.Transaction,
  params: {
    bankId: string;
    currencyId: string;
    label: string;
    providerId: string;
    userId: string;
  },
): Promise<CompanyFixture> {
  const companyId = await insertCompany(trx, {
    currencyId: params.currencyId,
    label: params.label,
    userId: params.userId,
  });
  const coaId = await insertCoa(trx, {
    companyId,
    currencyId: params.currencyId,
    label: params.label,
    userId: params.userId,
  });
  const credentialId = await insertCredential(trx, {
    companyId,
    providerId: params.providerId,
    userId: params.userId,
  });
  const bankAccountId = await insertBankAccount(trx, {
    bankId: params.bankId,
    companyId,
    connectionCredentialId: credentialId,
    coaId,
    currencyId: params.currencyId,
    providerId: params.providerId,
    userId: params.userId,
  });
  const batchId = await insertBatch(trx, {
    bankAccountId,
    companyId,
    connectionCredentialId: credentialId,
    source: 'bank_feed',
    userId: params.userId,
  });

  return {
    bankAccountId,
    batchId,
    coaId,
    credentialId,
    id: companyId,
  };
}

async function ensureProvider(
  trx: Knex.Transaction,
  userId: string,
): Promise<string> {
  const existing = await trx('bank_feed_providers').select('id').first();
  if (existing) return existing.id;

  const [provider] = await trx('bank_feed_providers')
    .insert({
      created_by_id: userId,
      display_name: 'Integrity Test Provider',
      key: `integrity_test_${randomToken()}`,
    })
    .returning<{ id: string }[]>('id');

  return provider.id;
}

async function ensureBank(
  trx: Knex.Transaction,
  params: { countryId: string; userId: string },
): Promise<string> {
  const existing = await trx('banks').select('id').first();
  if (existing) return existing.id;

  const [bank] = await trx('banks')
    .insert({
      country_id: params.countryId,
      created_by_id: params.userId,
      display_name: 'Integrity Test Bank',
      key: `us_integrity_test_${randomToken()}`,
    })
    .returning<{ id: string }[]>('id');

  return bank.id;
}

async function insertCompany(
  trx: Knex.Transaction,
  params: { currencyId: string; label: string; userId: string },
): Promise<string> {
  const countryId = await getCountryId(trx, 'US');
  const token = randomToken();
  const [company] = await trx('companies')
    .insert({
      accounting_basis: 'modified_accrual_basis',
      country_id: countryId,
      created_by_id: params.userId,
      display_name: `Integrity ${params.label.toUpperCase()}`,
      legal_name: `Integrity ${params.label.toUpperCase()} LLC`,
      reporting_currency_id: params.currencyId,
      short_code: `int_${params.label}_${token}`,
      type: 'business',
      year_end_day: 31,
      year_end_month: 12,
    })
    .returning<{ id: string }[]>('id');

  return company.id;
}

async function insertCoa(
  trx: Knex.Transaction,
  params: {
    companyId: string;
    currencyId: string;
    label: string;
    userId: string;
  },
): Promise<string> {
  const accountType = await trx('account_types')
    .where('key', 'ca_bank')
    .select('id')
    .first();
  if (!accountType) throw new Error('account_types.ca_bank not found');

  const [coa] = await trx('coa')
    .insert({
      account_type_id: accountType.id,
      code: `100-${params.label}-${randomToken()}`,
      company_id: params.companyId,
      created_by_id: params.userId,
      currency_id: params.currencyId,
      name: `Integrity Bank ${params.label.toUpperCase()}`,
    })
    .returning<{ id: string }[]>('id');

  return coa.id;
}

async function insertCredential(
  trx: Knex.Transaction,
  params: { companyId: string; providerId: string; userId: string },
): Promise<string> {
  const [credential] = await trx('bank_account_credentials')
    .insert({
      company_id: params.companyId,
      connected_by_id: params.userId,
      encrypted_access_token: `encrypted-${randomToken()}`,
      item_identifier: `item-${randomToken()}`,
      provider_id: params.providerId,
    })
    .returning<{ id: string }[]>('id');

  return credential.id;
}

async function insertBankAccount(
  trx: Knex.Transaction,
  params: {
    bankId: string;
    companyId: string;
    connectionCredentialId: string;
    coaId: string;
    currencyId: string;
    providerId: string;
    userId: string;
  },
): Promise<string> {
  const token = randomToken();
  const [bankAccount] = await trx('bank_accounts')
    .insert({
      account_name: `Integrity Account ${token}`,
      account_number: `acct-${token}`,
      account_type: 'checkings_current',
      bank_id: params.bankId,
      business_or_personal: 'business',
      coa_id: params.coaId,
      company_id: params.companyId,
      connection_credential_id: params.connectionCredentialId,
      connection_status: 'connected',
      created_by_id: params.userId,
      currency_id: params.currencyId,
      display_name: `Integrity Account ${token}`,
      provider_bank_account_id: `provider-account-${token}`,
      provider_id: params.providerId,
    })
    .returning<{ id: string }[]>('id');

  return bankAccount.id;
}

async function insertBatch(
  trx: Knex.Transaction,
  params: {
    bankAccountId: string;
    companyId: string;
    connectionCredentialId: string | null;
    source: 'bank_feed' | 'manual_entry';
    userId: string;
  },
): Promise<string> {
  const [batch] = await trx('bank_transaction_batches')
    .insert({
      bank_account_id: params.bankAccountId,
      company_id: params.companyId,
      connection_credential_id: params.connectionCredentialId,
      created_by_id: params.userId,
      end_date: '2025-03-31',
      fingerprint: `batch-${randomToken()}`,
      import_row_count: 1,
      source: params.source,
      start_date: '2025-03-01',
    })
    .returning<{ id: string }[]>('id');

  return batch.id;
}

async function insertTransaction(
  trx: Knex.Transaction,
  params: {
    bankAccountId: string;
    bankTransactionBatchId: string;
    companyId: string;
    userId: string;
  },
): Promise<string> {
  const [transaction] = await trx('bank_transactions')
    .insert({
      amount: -42,
      bank_account_id: params.bankAccountId,
      bank_transaction_batch_id: params.bankTransactionBatchId,
      company_id: params.companyId,
      created_by_id: params.userId,
      idempotency_key: `txn-${randomToken()}`,
      system_exchange_rate: 1,
      transaction_at: new Date('2025-03-15T12:00:00Z'),
      transaction_date: '2025-03-15',
    })
    .returning<{ id: string }[]>('id');

  return transaction.id;
}

async function expectForeignKeyViolation(
  operation: Promise<unknown>,
  constraint?: string,
): Promise<void> {
  const expected = constraint
    ? { code: '23503', constraint }
    : { code: '23503' };

  await expect(operation).rejects.toMatchObject(expected);
}

function randomToken(): string {
  return randomUUID().replaceAll('-', '').slice(0, 12);
}
