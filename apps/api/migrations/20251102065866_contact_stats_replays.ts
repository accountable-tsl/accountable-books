import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const tableName = 'contact_stats_replays';

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
      .uuid('contact_id')
      .nullable()
      .references('id')
      .inTable('contacts')
      .onDelete('SET NULL');
    table.string('contact_fingerprint', 256).notNullable();
    table.string('currency_code', 3).notNullable();
    table.date('start_date').notNullable();
    table.date('end_date').notNullable();
    table.text('triggered_by').notNullable();
    table.text('replay_reason').nullable();
    table.string('previous_snapshot_checksum', 64).nullable();
    table.string('new_snapshot_checksum', 64).nullable();
    table.integer('stats_replay_seq').notNullable().defaultTo(0);
    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, tableName);

  await knex.raw(`
    CREATE INDEX idx_contact_stats_replays_company
    ON ${tableName}(company_id, contact_fingerprint)
    WHERE is_deleted = FALSE;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_contact_stats_replays_company;`);
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
