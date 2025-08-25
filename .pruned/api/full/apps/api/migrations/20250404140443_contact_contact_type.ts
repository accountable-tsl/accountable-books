import type { Knex } from 'knex';

const tableName = 'contact_contact_type';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('contact_id').notNullable().references('id').inTable('contacts').onDelete('CASCADE');

    table.specificType('type', 'contact_type').notNullable();

    table.primary(['contact_id', 'type']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(tableName);
}
