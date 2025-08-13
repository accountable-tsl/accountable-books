import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/timestamp';

const tableName = 'audit_events';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.enu('entity_type', ['batch', 'transaction', 'prediction', 'journal']).notNullable();
    table.uuid('entity_id').notNullable();
    table
      .enu('action', [
        'create',
        'update',
        'delete',
        'import',
        'predict',
        'post',
        'edit',
        'approve',
        'reject',
      ])
      .notNullable();
    table.jsonb('payload').notNullable().defaultTo('{}');
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('RESTRICT');
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');

    table.text('notes').nullable();

    addStandardColumns(table);
  });

  // Create indexes for common query patterns
  await knex.schema.alterTable(tableName, (table) => {
    table.index(['company_id', 'action']);
    table.index(['entity_type', 'entity_id']);
    table.index(['user_id', 'created_at']);
    table.index(['company_id', 'created_at']);
    table.index(['action', 'created_at']);
  });

  // Add compound lookup index with DESC ordering
  await knex.raw(`
    CREATE INDEX audit_events_company_entity_lookup_idx 
    ON audit_events (company_id, entity_type, entity_id, created_at DESC);
  `);

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
