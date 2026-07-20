import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Firm-user client assignments delegate a specific client workspace to firm
 * staff. They sit beneath the current client-firm assignment and support
 * workload/access routing for firm teams.
 */

const schemaName = 'app';
const tableName = 'firm_user_client_assignments';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('firm_staff_user_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('CASCADE');

    table
      .uuid('client_company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
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
      ['client_company_id'],
      'firm_user_client_assignments_client_company_idx',
    );
  });

  await knex.raw(`
    CREATE UNIQUE INDEX firm_user_client_assignments_active_unique
    ON "${schemaName}"."${tableName}" (firm_staff_user_id, client_company_id)
    WHERE is_deleted = false
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT firm_user_client_assignments_deleted_state_chk
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
