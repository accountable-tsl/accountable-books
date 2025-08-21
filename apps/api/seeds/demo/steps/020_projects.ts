import type { Knex } from 'knex';
import { addNewProjects } from '../../src/domains/projects/projects.model';
import { generateDemoProjectsForCompany } from '../../seeds/demo/utils/004_genDemoProjects';
import type { MarkFn, SeedCtx } from '../engine/helpers';

export async function up(knex: Knex, ctx: SeedCtx, mark: MarkFn) {
  const { country, type, companyShortCode, userEmail } = ctx;
  if (type === 'individual') return; // no projects for individual

  const company = await knex('companies')
    .select('id')
    .where({ short_code: companyShortCode })
    .first();
  const user = await knex('users').select('id').where({ email: userEmail }).first();
  if (!company?.id || !user?.id) throw new Error('Company or user not found for projects step');

  // get contacts to attach
  const contacts = await knex('contacts').select('id').where({ company_id: company.id });
  const contactIds = contacts.map((c) => c.id);
  const inputs = generateDemoProjectsForCompany({
    companyType: type,
    countryCode: country,
    contactIds,
  });
  if (!inputs.length) return;

  const result = await addNewProjects({ input: inputs, companyId: company.id, userId: user.id });
  if (!result.success || !result.data) throw new Error(result.message);

  for (const p of result.data) await mark('projects', { id: p.id, company_id: company.id }, p);
}
