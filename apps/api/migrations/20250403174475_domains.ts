import type { Knex } from 'knex';

import {
  createContactTypeDomain,
  createFiscalPeriodTypeDomain,
  dropDomainIfExists,
} from './utils/domains.js';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(createContactTypeDomain());
  await knex.raw(createFiscalPeriodTypeDomain());
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(dropDomainIfExists('fiscal_period_type'));
  await knex.raw(dropDomainIfExists('contact_type'));
}
