import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Bank feed provider countries define the countries where each banking
 * integration can be offered. Bootstrap creates canonical capability mappings;
 * runtime configuration can disable a mapping without deleting its identity.
 */
const schemaName = 'app';
const tableName = 'bank_feed_provider_countries';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table
      .uuid('bank_feed_provider_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.bank_feed_providers`)
      .onDelete('CASCADE');
    table
      .uuid('country_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.countries`)
      .onDelete('RESTRICT');
    table.boolean('active').notNullable().defaultTo(true);
    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('RESTRICT');

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .uuid('updated_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('SET NULL');
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.primary(['bank_feed_provider_id', 'country_id'], {
      constraintName: 'bank_feed_provider_countries_pkey',
    });
    table.index(['country_id'], 'bank_feed_provider_countries_country_id_idx');
  });

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
