import type { Knex } from 'knex';
import { createUpdateTimestampTrigger, dropUpdateTimestampTrigger } from './utils/db';

const tableName = 'bank_feed_providers';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('key').notNullable().unique(); // e.g., 'mono', 'plaid'
    table.string('name').notNullable();
    table.string('external_id');
    table.text('description');
    table.string('website');
    table.string('logo_url');
    table
      .enu('status', ['active', 'inactive', 'deprecated'], {
        enumName: 'bank_feed_provider_status',
        useNative: false,
      })
      .notNullable()
      .defaultTo('active'); // active, inactive, deprecated
    table.integer('priority').nullable(); // used for fallback logic

    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');

    table.uuid('updated_by_id').nullable().references('id').inTable('users').onDelete('SET NULL');

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);

  // Drop dependent tables first to avoid foreign key constraint issues
  await knex.schema.dropTableIfExists('bank_provider_mappings');
  await knex.schema.dropTableIfExists('bank_feed_provider_countries');

  await knex.schema.dropTableIfExists(tableName);
}
