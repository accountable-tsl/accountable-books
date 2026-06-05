import type { Knex } from 'knex';

import {
  createContactTypeDomain,
  dropDomainIfExists,
} from './utils/domains.js';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(createContactTypeDomain());
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(dropDomainIfExists('contact_type'));
}
