import type { Knex } from 'knex';
import { addNewContacts } from '../../src/domains/contacts/contacts.model';
import { generateDemoContactsForCompany } from '../../seeds/demo/utils/003_genDemoContacts';
import type { MarkFn, SeedCtx } from '../engine/helpers';

export async function up(knex: Knex, ctx: SeedCtx, mark: MarkFn) {
  const { country, type, companyShortCode, userEmail } = ctx;

  // Lookup company and user
  const company = await knex('companies')
    .select('id')
    .where({ short_code: companyShortCode })
    .first();
  const user = await knex('users').select('id').where({ email: userEmail }).first();
  if (!company?.id || !user?.id) throw new Error('Company or user not found for contacts step');

  const inputs = generateDemoContactsForCompany({ companyType: type, countryCode: country });
  if (!inputs.length) return;

  const result = await addNewContacts({ input: inputs, companyId: company.id, userId: user.id });
  if (!result.success || !result.data) {
    if (String(result.message || '').startsWith('Contact(s) with these names')) return; // already exists
    throw new Error(result.message);
  }

  for (const c of result.data) {
    await mark('contacts', { id: c.id, company_id: company.id }, c);
  }
}
