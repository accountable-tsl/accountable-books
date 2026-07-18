import type { Knex } from 'knex';

const schemaName = 'app';
const tableName = 'outbox';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).alterTable(tableName, (table) => {
    table.boolean('follow_up_requested').notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).alterTable(tableName, (table) => {
    table.dropColumn('follow_up_requested');
  });
}
