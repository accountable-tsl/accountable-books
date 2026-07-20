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
