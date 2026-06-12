import type { Knex } from 'knex';

const tableName = 'bank_feed_provider_countries';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table
      .uuid('bank_feed_provider_id')
      .notNullable()
      .references('id')
      .inTable('bank_feed_providers')
      .onDelete('CASCADE');
    table
      .uuid('country_id')
      .notNullable()
      .references('id')
      .inTable('countries')
      .onDelete('CASCADE');
    table.boolean('active').notNullable().defaultTo(true);
    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');

    table
      .uuid('updated_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table.primary(['bank_feed_provider_id', 'country_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(tableName);
}
