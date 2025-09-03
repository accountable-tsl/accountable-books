import type { Knex } from 'knex';

const tableName = 'company_bank_credentials';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');

    table.uuid('provider_id').notNullable().references('id').inTable('bank_feed_providers');
    table.string('identifier').nullable(); // Primary identifier if provided
    table.string('encrypted_token').nullable(); // Primary credential
    table.jsonb('raw_data').notNullable().defaultTo('{}'); // Store full record received
    table.enu('status', ['active', 'expired', 'revoked']).defaultTo('active');
    table.timestamp('first_connected_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('last_connected_at', { useTz: true }).defaultTo(knex.fn.now());
    table.uuid('connected_by').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');

    table.index(['company_id', 'provider_id']);
    table.index(['provider_id', 'status']);
  });

  await knex.raw(`
    CREATE UNIQUE INDEX company_provider_identifier_unique 
    ON company_bank_credentials (company_id, provider_id, identifier) 
    WHERE identifier IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(tableName);
}
