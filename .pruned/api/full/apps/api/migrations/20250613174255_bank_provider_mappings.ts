import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db';
import { syncMonoInstitutionsToMappingsNG } from '../src/domains/mapBankToProviderBank/bankProviderMappings.model';
import { adminUser } from './20250403184441_users';

const tableName = 'bank_provider_mappings';
const adminUserId = adminUser.id;
if (!adminUserId) throw new Error('adminUserId is required');
const seedBankProviderMappings = async (knex: Knex) => {
  await syncMonoInstitutionsToMappingsNG(adminUserId, knex);
};
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('provider_id') // Bank Feed Provider ID
      .notNullable()
      .references('id')
      .inTable('bank_feed_providers')
      .onDelete('CASCADE');

    table.uuid('bank_id').notNullable().references('id').inTable('banks').onDelete('CASCADE');

    table.string('provider_bank_id').notNullable().comment("Provider's primary bank identifier");

    table.string('provider_alternate_id').nullable(); // Another ID or Bank Code from provider

    table
      .string('provider_bank_secondary_reference')
      .nullable()
      .comment('Fallback ID from provider'); // optional secondary ID

    table.string('provider_bank_name').nullable();
    table.jsonb('raw_provider_data').nullable();

    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');

    table.uuid('updated_by_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    addStandardColumns(table);

    table.unique(['provider_id', 'provider_bank_id']);
    table.index(['provider_id', 'bank_id']);
    table.index(['bank_id']);
    table.index(['provider_id']);
  });
  await createUpdateTimestampTrigger(knex, tableName);

  await seedBankProviderMappings(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
