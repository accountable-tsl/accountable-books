import { knexClient } from '../../src/db/knexClient';
import { CompanyType } from '../../src/domains/companies/companies.types';
import { addNewContacts } from '../../src/domains/contacts/contacts.model';
import { registerNewAccount } from '../../src/features/signup/signup.service';
import { demoSeedConfig } from './data/config';
import { DemoSeedConfig } from './data/types';
import { addNewProjects } from '../../src/domains/projects/projects.model';
import type { Knex } from 'knex';
import { type SeedContext, upsertByKey, withSeedRun } from './utils/helpers';

/** Seed one demo scenario. */
export async function seedDemo(knex: Knex, cfg: DemoSeedConfig): Promise<void> {
  console.log(`Seeding ${cfg.company?.type} demo`);
  const name = `demo:${cfg.company.type}:${cfg.company.shortCode}`; // unique per scenario
  const version = 1; // bump when behavior changes
  const tags = ['demo', 'tenant', 'company', cfg.company?.type];
  const companyType = cfg.company?.type;

  const ctx: SeedContext = {
    companyId: cfg.company.shortCode,
    companyShortCode: cfg.company.shortCode,
    variant: cfg.company?.type,
    ...cfg.company,
  };

  await withSeedRun(knex, this, ctx, async (trx, mark) => {
    // Ensure or create company + user. No “skip”.
    const existingCompany = await trx('companies')
      .select('id')
      .where({ short_code: cfg.company.shortCode })
      .first();

    const existingUser = await trx('users').select('id').where({ email: cfg.user.email }).first();

    let companyId: string;
    let userId: string;

    if (!existingCompany || !existingUser) {
      // Create company and user
      const signup = await registerNewAccount({
        user: cfg.user,
        company: cfg.company,
      });

      if (!signup.success || !signup.data) throw new Error(signup.message);

      companyId = signup.data.company.id;
      userId = signup.data.user.id;

      // Only mark actually created here
      await mark('companies', {
        id: companyId,
        short_code: cfg.company.shortCode,
        company_id: companyId,
      });
      await mark('users', { id: userId, email: cfg.user.email, company_id: companyId });
    } else {
      // Ensure deterministic updates for idempotency
      // Upsert any fields you need to keep in sync
      await upsertByKey(trx, 'companies', ['short_code'], cfg.company);
      await upsertByKey(trx, 'users', ['email'], cfg.user);
      companyId = existingCompany.id;
      userId = existingUser.id;
    }

    // Add bank account(s)

    // Add contacts
    const addContacts = await addNewContacts({
      input: cfg.contacts,
      companyId,
      userId,
    });
    if (!addContacts.success || !addContacts.data) {
      throw new Error(addContacts.message);
    }
    const contacts = addContacts.data;
    const contactIds = new Set(contacts.map((c: any) => c.id));

    if (cfg.company.type !== 'individual') {
      const projectsInput = cfg.genProjects(Array.from(contactIds));
      const projectsRes = await addNewProjects({
        input: projectsInput,
        companyId,
        userId,
      });
      if (!projectsRes.success || !projectsRes.data) throw new Error(projectsRes.message);
      for (const p of projectsRes.data) {
        await mark('projects', { id: p.id, company_id: companyId });
      }
    }
    // Store projects data for potential future use
    // _projects = addProjects.data;
  });
}

/** Seed all demos (serially by default, or in parallel with the flag). */
export async function seedAllDemos({
  parallel = false,
}: { parallel?: boolean } = {}): Promise<void> {
  const configs = demoSeedConfig;

  if (parallel) {
    await Promise.all(configs.map((cfg) => seedDemo(knexClient, cfg)));
  } else {
    for (const cfg of configs) await seedDemo(knexClient, cfg);
  }
  await knexClient.destroy();
}

/** Seed by company type */
export async function seedByType(type: CompanyType): Promise<void> {
  const cfg = demoSeedConfig.find((s) => s.company?.type === type);

  if (!cfg) throw new Error(`Unknown company type: ${type}`);

  await seedDemo(knexClient, cfg);
}
