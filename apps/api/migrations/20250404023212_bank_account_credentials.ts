import type { Knex } from 'knex';

const tableName = 'bank_account_credentials';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table
      .uuid('provider_id')
      .notNullable()
      .references('id')
      .inTable('bank_feed_providers')
      .onDelete('CASCADE');
    table.string('item_identifier').nullable(); // Primary identifier if provided
    table.string('encrypted_access_token').notNullable(); // Primary credential
    table.string('encrypted_refresh_token').nullable(); // If provider uses refresh tokens
    table.string('institution_id').nullable();
    table.string('institution_name').nullable();
    table.jsonb('raw_metadata').nullable().defaultTo('{}'); // Store credentials received
    table
      .enu('status', ['active', 'expired', 'revoked'], {
        enumName: 'bank_account_credential_status',
        useNative: false,
      })
      .defaultTo('active');
    table.timestamp('connected_at', { useTz: true }).defaultTo(knex.fn.now());
    table.uuid('connected_by').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    table.timestamp('expires_at', { useTz: true }).nullable(); // Token expiry if applicable
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');

    table.index(['company_id', 'provider_id', 'status']);
  });

  await knex.raw(`
    CREATE UNIQUE INDEX company_provider_identifier_unique 
    ON bank_account_credentials (company_id, provider_id, item_identifier) 
    WHERE item_identifier IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(tableName);

  await knex.raw(`DROP TYPE IF EXISTS bank_account_credential_status`);
}
