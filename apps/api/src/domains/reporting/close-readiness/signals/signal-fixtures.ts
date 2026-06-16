import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';

import type { LedgerTransactionSource } from './close-signals.types.js';

/**
 * Shared test fixtures for the close-signals loader and sync integration tests.
 * Not a test file itself (no `.test.ts` suffix), so it is never collected as a
 * suite.
 */
export type Fixture = {
  userId: string;
  companyId: string;
  currencyId: string;
};

export type EntryInput = {
  accountTypeKey: string;
  amount: number;
  isBankLeg?: boolean;
  isMonetary?: boolean;
  humanReviewed?: boolean;
  contactId?: string | null;
};

export async function createFixture(
  trx: Knex.Transaction,
  accountingBasis:
    | 'modified_cash_basis'
    | 'modified_accrual_basis' = 'modified_accrual_basis',
): Promise<Fixture> {
  const [user] = await trx('users')
    .insert({
      firstname: 'Signal',
      lastname: 'Fixture',
      email: `signal-fixture-${randomUUID()}@example.com`,
      user_type: 'regular',
    })
    .returning<{ id: string }[]>('id');
  const currency = await trx('currencies')
    .where({ code: 'USD' })
    .select<{ id: string }[]>('id')
    .first();
  const country = await trx('countries')
    .where({ code: 'US' })
    .select<{ id: string }[]>('id')
    .first();
  if (!user || !currency || !country) {
    throw new Error('Required bootstrap rows not found');
  }

  const [company] = await trx('companies')
    .insert({
      legal_name: 'Signal Fixture Co',
      display_name: 'Signal Fixture',
      short_code: `sf-${randomUUID().slice(0, 8)}`,
      type: 'business',
      year_end_day: 31,
      year_end_month: 12,
      accounting_basis: accountingBasis,
      country_id: country.id,
      reporting_currency_id: currency.id,
      default_timezone: 'Europe/London',
      created_by_id: user.id,
    })
    .returning<{ id: string }[]>('id');
  if (!company) throw new Error('Failed to create company');

  return { userId: user.id, companyId: company.id, currencyId: currency.id };
}

export async function insertMonthlyPeriod(
  trx: Knex.Transaction,
  fixture: Fixture,
  period: {
    fiscalYear: number;
    periodNumber: number;
    startDate: string;
    endDate: string;
  },
): Promise<void> {
  await trx('fiscal_calendar').insert({
    company_id: fixture.companyId,
    fiscal_year: period.fiscalYear,
    period_number: period.periodNumber,
    period_type: 'monthly',
    start_date: period.startDate,
    end_date: period.endDate,
    status: 'open',
  });
}

export async function createCoa(
  trx: Knex.Transaction,
  fixture: Fixture,
  accountTypeKey: string,
): Promise<string> {
  const accountType = await trx('account_types')
    .where({ key: accountTypeKey })
    .select<{ id: string }[]>('id')
    .first();
  if (!accountType) throw new Error(`Account type not found: ${accountTypeKey}`);

  const [coa] = await trx('coa')
    .insert({
      company_id: fixture.companyId,
      account_type_id: accountType.id,
      currency_id: fixture.currencyId,
      name: accountTypeKey,
      code: `c-${randomUUID().slice(0, 6)}`,
      created_by_id: fixture.userId,
    })
    .returning<{ id: string }[]>('id');
  if (!coa) throw new Error(`Failed to create COA for ${accountTypeKey}`);
  return coa.id;
}

export async function insertContact(
  trx: Knex.Transaction,
  fixture: Fixture,
): Promise<string> {
  const [contact] = await trx('contacts')
    .insert({
      company_id: fixture.companyId,
      display_name: 'Acme Supplier',
      normalized_name: 'acme supplier',
      review_status: 'unreviewed',
      created_by_id: fixture.userId,
    })
    .returning<{ id: string }[]>('id');
  if (!contact) throw new Error('Failed to create contact');
  return contact.id;
}

export async function insertLedgerTransaction(
  trx: Knex.Transaction,
  fixture: Fixture,
  options: {
    transactionSource?: LedgerTransactionSource;
    categorizationSource?: 'manual' | 'rule' | 'ml' | 'ml_heuristic';
    transactionDate?: string;
    contactId?: string | null;
  },
  entries: EntryInput[],
): Promise<string> {
  const transactionSource = options.transactionSource ?? 'bank_transaction';
  const categorizationSource = options.categorizationSource ?? 'manual';
  const transactionDate = options.transactionDate ?? '2026-06-10';

  const [ledgerTransaction] = await trx('ledger_transactions')
    .insert({
      company_id: fixture.companyId,
      transaction_date: transactionDate,
      transaction_source: transactionSource,
      categorization_source: categorizationSource,
      contact_id: options.contactId ?? null,
      source_transaction_id: randomUUID(),
      source_transaction_currency_id: fixture.currencyId,
      // bank transactions require source date/amount; manual journals require
      // them null (ledger_transactions_source_fields_chk).
      ...(transactionSource === 'bank_transaction'
        ? {
            source_transaction_date: transactionDate,
            source_transaction_amount: entries.reduce(
              (sum, entry) => sum + Math.abs(entry.amount),
              0,
            ),
          }
        : {}),
      created_by_id: fixture.userId,
    })
    .returning<{ id: string }[]>('id');
  if (!ledgerTransaction) throw new Error('Failed to create ledger transaction');

  const entryRows = [];
  for (const entry of entries) {
    const coaId = await createCoa(trx, fixture, entry.accountTypeKey);
    entryRows.push({
      company_id: fixture.companyId,
      ledger_transaction_id: ledgerTransaction.id,
      fs_date: transactionDate,
      coa_id: coaId,
      source_currency_id: fixture.currencyId,
      source_amount: entry.amount,
      system_exchange_rate: 1,
      custom_exchange_rate: 1,
      is_bank_leg: entry.isBankLeg ?? false,
      is_monetary: entry.isMonetary ?? false,
      human_reviewed: entry.humanReviewed ?? false,
      contact_id: entry.contactId ?? null,
    });
  }
  await trx('ledger_entries').insert(entryRows);

  return ledgerTransaction.id;
}

export async function attachDocument(
  trx: Knex.Transaction,
  fixture: Fixture,
  transactionId: string,
): Promise<void> {
  const [file] = await trx('files')
    .insert({
      name: 'invoice.pdf',
      key: `k-${randomUUID()}`,
      bucket_name: 'test-bucket',
      url: 'https://example.com/invoice.pdf',
      mime_type: 'application/pdf',
      size_bytes: 1024,
      provider: 'cloudflare_r2',
      company_id: fixture.companyId,
      uploaded_by_id: fixture.userId,
    })
    .returning<{ id: string }[]>('id');
  if (!file) throw new Error('Failed to create file');

  await trx('file_attachments').insert({
    file_id: file.id,
    source: 'ledger',
    transaction_id: transactionId,
    attached_by_id: fixture.userId,
  });
}
