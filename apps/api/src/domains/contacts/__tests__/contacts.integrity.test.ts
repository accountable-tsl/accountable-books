import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import { SYSTEM_USER_ID } from '../../../bootstrap/phases/users.bootstrap.js';

describe('contacts database integrity', () => {
  let trx: Knex.Transaction;
  let companyA: string;
  let companyB: string;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    await trx.raw('SET LOCAL search_path TO app, public');
    companyA = await insertCompany(trx, 'a');
    companyB = await insertCompany(trx, 'b');
  });

  afterEach(async () => {
    if (trx) await trx.rollback();
  });

  it('allows duplicate canonical names within a company', async () => {
    const first = await insertContact(trx, companyA, 'Duplicate Name');
    const second = await insertContact(trx, companyA, 'Duplicate Name');

    expect(first).not.toBe(second);
  });

  it('rejects invalid contact review lifecycle states', async () => {
    await expect(
      trx('contacts').insert({
        company_id: companyA,
        created_by_id: SYSTEM_USER_ID,
        display_name: 'Invalid Review',
        normalized_name: 'invalid review',
        review_status: 'unreviewed',
        reviewed_at: trx.fn.now(),
        status: 'active',
      }),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'contacts_review_state_chk',
    });
  });

  it('rejects invalid alias verification lifecycle states', async () => {
    const contactId = await insertContact(trx, companyA, 'Alias Owner');

    await expect(
      trx('contact_aliases').insert({
        alias: 'Alias',
        company_id: companyA,
        contact_id: contactId,
        created_by_id: SYSTEM_USER_ID,
        normalized_alias: 'alias',
        source: 'user',
        verification_status: 'user_confirmed',
      }),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'contact_aliases_verified_state_chk',
    });
  });

  it('rejects invalid alias deletion lifecycle states', async () => {
    const contactId = await insertContact(trx, companyA, 'Deleted Alias Owner');

    await expect(
      trx('contact_aliases').insert({
        alias: 'Deleted Alias',
        company_id: companyA,
        contact_id: contactId,
        created_by_id: SYSTEM_USER_ID,
        is_deleted: true,
        normalized_alias: 'deleted alias',
        source: 'user',
        verification_status: 'system_inferred',
      }),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'contact_aliases_deleted_state_chk',
    });
  });

  it('rejects a resolution whose alias belongs to another contact', async () => {
    const aliasOwnerId = await insertContact(trx, companyA, 'Alias Owner');
    const selectedContactId = await insertContact(
      trx,
      companyA,
      'Selected Contact',
    );
    const aliasId = await insertAlias(trx, companyA, aliasOwnerId);
    const bankTransactionId = await insertBankTransaction(
      trx,
      companyA,
      'alias-contradiction',
    );

    await expect(
      trx('bank_transaction_contact_resolutions').insert({
        bank_transaction_id: bankTransactionId,
        company_id: companyA,
        contact_alias_id: aliasId,
        contact_id: selectedContactId,
        resolved_at: trx.fn.now(),
        source: 'alias',
        status: 'inferred',
      }),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'bank_transaction_contact_resolutions_contact_alias_fk',
    });
  });

  for (const status of ['unresolved', 'ambiguous', 'ignored'] as const) {
    it(`rejects an alias on a ${status} resolution`, async () => {
      const contactId = await insertContact(
        trx,
        companyA,
        `${status} Alias Owner`,
      );
      const aliasId = await insertAlias(trx, companyA, contactId);
      const bankTransactionId = await insertBankTransaction(
        trx,
        companyA,
        `${status}-alias`,
      );

      await expect(
        trx('bank_transaction_contact_resolutions').insert({
          bank_transaction_id: bankTransactionId,
          company_id: companyA,
          contact_alias_id: aliasId,
          contact_id: contactId,
          resolved_at: status === 'unresolved' ? null : trx.fn.now(),
          source: status === 'unresolved' ? 'none' : 'user',
          status,
        }),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'bt_contact_resolutions_state_chk',
      });
    });
  }

  it('rejects a project contact owned by another company', async () => {
    const contactId = await insertContact(trx, companyA, 'Company A Contact');

    await expect(
      trx('projects').insert({
        company_id: companyB,
        contact_id: contactId,
        created_by_id: SYSTEM_USER_ID,
        name: `Cross-company ${randomUUID()}`,
      }),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'projects_contact_company_fk',
    });
  });
});

async function insertCompany(
  trx: Knex.Transaction,
  label: string,
): Promise<string> {
  const country = await trx('countries').select('id').first();
  const currency = await trx('currencies').select('id').first();
  if (!country || !currency) throw new Error('Bootstrap catalogs are required');

  const token = randomUUID().replaceAll('-', '').slice(0, 12);
  const [company] = await trx('companies')
    .insert({
      accounting_basis: 'modified_accrual_basis',
      country_id: country.id,
      created_by_id: SYSTEM_USER_ID,
      legal_name: `Contact Integrity ${label.toUpperCase()}`,
      reporting_currency_id: currency.id,
      short_code: `contact_${label}_${token}`,
      type: 'business',
      year_end_day: 31,
      year_end_month: 12,
    })
    .returning<{ id: string }[]>('id');

  return company.id;
}

async function insertContact(
  trx: Knex.Transaction,
  companyId: string,
  displayName: string,
): Promise<string> {
  const [contact] = await trx('contacts')
    .insert({
      company_id: companyId,
      created_by_id: SYSTEM_USER_ID,
      display_name: displayName,
      normalized_name: displayName.toLowerCase(),
      review_status: 'confirmed',
      reviewed_at: trx.fn.now(),
      status: 'active',
    })
    .returning<{ id: string }[]>('id');

  return contact.id;
}

async function insertAlias(
  trx: Knex.Transaction,
  companyId: string,
  contactId: string,
): Promise<string> {
  const token = randomToken();
  const [alias] = await trx('contact_aliases')
    .insert({
      alias: `Alias ${token}`,
      company_id: companyId,
      contact_id: contactId,
      created_by_id: SYSTEM_USER_ID,
      normalized_alias: `alias ${token}`,
      source: 'user',
      verification_status: 'system_inferred',
    })
    .returning<{ id: string }[]>('id');

  return alias.id;
}

async function insertBankTransaction(
  trx: Knex.Transaction,
  companyId: string,
  label: string,
): Promise<string> {
  const currency = await trx('currencies').select('id').first();
  const provider = await trx('bank_feed_providers').select('id').first();
  const bank = await trx('banks').select('id').first();
  const accountType = await trx('account_types')
    .where('key', 'ca_bank')
    .first();
  if (!currency || !provider || !bank || !accountType) {
    throw new Error('Bootstrap catalogs are required');
  }

  const token = randomToken();
  const [coa] = await trx('coa')
    .insert({
      account_type_id: accountType.id,
      code: `contact-${token}`,
      company_id: companyId,
      created_by_id: SYSTEM_USER_ID,
      currency_id: currency.id,
      name: `Contact Integrity ${label}`,
    })
    .returning<{ id: string }[]>('id');
  const [credential] = await trx('bank_account_credentials')
    .insert({
      company_id: companyId,
      connected_by_id: SYSTEM_USER_ID,
      encrypted_access_token: `encrypted-${token}`,
      item_identifier: `item-${token}`,
      provider_id: provider.id,
    })
    .returning<{ id: string }[]>('id');
  const [account] = await trx('bank_accounts')
    .insert({
      account_number: `account-${token}`,
      bank_id: bank.id,
      coa_id: coa.id,
      company_id: companyId,
      connection_credential_id: credential.id,
      connection_status: 'connected',
      created_by_id: SYSTEM_USER_ID,
      currency_id: currency.id,
      display_name: `Contact Integrity ${label}`,
      provider_bank_account_id: `provider-account-${token}`,
      provider_id: provider.id,
    })
    .returning<{ id: string }[]>('id');
  const [batch] = await trx('bank_transaction_batches')
    .insert({
      bank_account_id: account.id,
      company_id: companyId,
      connection_credential_id: credential.id,
      created_by_id: SYSTEM_USER_ID,
      end_date: '2025-03-31',
      fingerprint: `batch-${token}`,
      import_row_count: 1,
      source: 'bank_feed',
      start_date: '2025-03-01',
    })
    .returning<{ id: string }[]>('id');
  const [transaction] = await trx('bank_transactions')
    .insert({
      amount: -42,
      bank_account_id: account.id,
      bank_transaction_batch_id: batch.id,
      company_id: companyId,
      created_by_id: SYSTEM_USER_ID,
      idempotency_key: `transaction-${token}`,
      system_exchange_rate: 1,
      transaction_at: new Date('2025-03-15T12:00:00Z'),
      transaction_date: '2025-03-15',
    })
    .returning<{ id: string }[]>('id');

  return transaction.id;
}

function randomToken(): string {
  return randomUUID().replaceAll('-', '').slice(0, 12);
}
