import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const coaTable = 'coa';
const coaVersionsTable = 'coa_versions';
const coaSnapshotVersionsTable = 'coa_snapshot_versions';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(coaVersionsTable, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .uuid('coa_id')
      .notNullable()
      .references('id')
      .inTable('coa')
      .onDelete('CASCADE');

    table.integer('version_seq').notNullable().defaultTo(1);
    table.timestamp('effective_from').notNullable().defaultTo(knex.fn.now());
    table.timestamp('effective_to').nullable();
    table.jsonb('changeset').nullable();

    table.string('code', 256).nullable();
    table.string('name', 256).notNullable();
    table.string('description', 512).nullable();
    table.boolean('is_active').defaultTo(true);
    table.boolean('locked').defaultTo(false);
    table.specificType('source', 'coa_source').nullable();

    table
      .uuid('account_type_id')
      .notNullable()
      .references('id')
      .inTable('account_types')
      .onDelete('RESTRICT');

    table
      .uuid('currency_id')
      .notNullable()
      .references('id')
      .inTable('currencies')
      .onDelete('RESTRICT');

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('RESTRICT');

    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');

    table
      .uuid('updated_by_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    addStandardColumns(knex, table);
  });

  await knex.schema.alterTable(coaTable, (table) => {
    table.integer('version_seq').nullable();
  });

  await knex.schema.createTable(coaSnapshotVersionsTable, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .uuid('company_id')
      .unique()
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');

    table.bigInteger('snapshot_version').notNullable();
    table.string('checksum', 64).notNullable();

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
    table.string('notes', 1024).nullable();
    table.jsonb('metadata').nullable();
    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, coaVersionsTable);
  await createUpdateTimestampTrigger(knex, coaSnapshotVersionsTable);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, coaSnapshotVersionsTable);
  await dropUpdateTimestampTrigger(knex, coaVersionsTable);

  await knex.schema.dropTableIfExists(coaSnapshotVersionsTable);
  await knex.schema.alterTable(coaTable, (table) => {
    table.dropColumn('version_seq');
  });
  await knex.schema.dropTableIfExists(coaVersionsTable);
}
