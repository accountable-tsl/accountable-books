import type { Knex } from 'knex';

const tableName = 'sequence_counters';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('RESTRICT');

    table.string('scope').notNullable();
    table.string('bucket').notNullable();

    table.integer('next_seq').notNullable().defaultTo(1);

    table.primary(['company_id', 'scope', 'bucket']);

    table.index(['company_id', 'scope']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable(tableName);
}
