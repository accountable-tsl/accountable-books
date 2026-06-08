import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Client-firm assignments are the canonical current assignment rows linking a
 * client workspace to its managing accounting firm. companies.assigned_firm_id
 * is a denormalized pointer maintained from this relationship.
 */

const schemaName = 'app';
const tableName = 'client_firm_assignments';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('client_company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('CASCADE');

    table
      .uuid('accounting_firm_company_id')
      .notNullable()
      .references('company_id')
      .inTable(`${schemaName}.accounting_firms_meta`)
      .onDelete('CASCADE');

    table
      .uuid('updated_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('SET NULL');

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
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.boolean('is_deleted').notNullable().defaultTo(false);
    table.timestamp('deleted_at', { useTz: true }).nullable();

    table.index(
      ['accounting_firm_company_id'],
      'client_firm_assignments_firm_company_idx',
    );
    table.index(
      ['client_company_id', 'accounting_firm_company_id'],
      'client_firm_assignments_client_firm_idx',
    );
  });

  await knex.raw(`
    CREATE UNIQUE INDEX client_firm_assignments_active_client_unique
    ON "${schemaName}"."${tableName}" (client_company_id)
    WHERE is_deleted = false
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT client_firm_assignments_deleted_state_chk
    CHECK (
      (is_deleted = false AND deleted_at IS NULL)
      OR
      (is_deleted = true AND deleted_at IS NOT NULL)
    )
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
