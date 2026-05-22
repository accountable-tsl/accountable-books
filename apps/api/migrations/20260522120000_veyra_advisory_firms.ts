import type { Knex } from 'knex';

import { finalizeAccountingFirmBillingBootstrap } from '../src/domains/billing/provisioning/provisioning.service.js';
import { adminUser, seedAdminUser } from './20250403184441_users.js';
import { VEYRA_ADVISORY_FIRMS } from './data/veyra-advisory-firms.js';
import {
  removeSeededAccountingFirm,
  seedAccountingFirm,
} from './utils/seed-accounting-firm.js';

async function resolveAdminCreator(knex: Knex): Promise<{
  id: string;
  email: string;
}> {
  const seeded = await seedAdminUser(knex);
  if (seeded?.id && seeded.email) {
    return { id: seeded.id, email: seeded.email };
  }

  const existing = await knex('users')
    .where({ email: adminUser.email.trim().toLowerCase() })
    .first<{ id: string; email: string }>();

  if (!existing?.id || !existing.email) {
    throw new Error(
      'Admin user is required before seeding Veyra advisory firms',
    );
  }

  return existing;
}

export async function up(knex: Knex): Promise<void> {
  const admin = await resolveAdminCreator(knex);

  for (const firm of VEYRA_ADVISORY_FIRMS) {
    const company = await seedAccountingFirm(knex, {
      ...firm,
      createdById: admin.id,
    });

    await finalizeAccountingFirmBillingBootstrap(company.id, {
      billingEmail: admin.email,
      db: knex,
    });

    console.log(`Billing provisioned for ${company.short_code}`);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const firm of VEYRA_ADVISORY_FIRMS) {
    await removeSeededAccountingFirm(knex, firm.id);
    console.log(`Removed seeded accounting firm: ${firm.shortCode}`);
  }
}
