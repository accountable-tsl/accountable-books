import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const tableName = 'ai_approvals';

const APPROVAL_STATUSES = ['pending', 'executed', 'rejected'];
const APPROVAL_RISKS = ['low', 'medium', 'high'];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('RESTRICT');

    table
      .uuid('requested_by_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');

    table.text('capability_id').notNullable();
    table.text('domain').nullable();

    table.text('summary').notNullable();
    table
      .string('risk', 16)
      .notNullable()
      .defaultTo('high')
      .checkIn(APPROVAL_RISKS, 'ai_approvals_risk_check');

    table.text('tool').notNullable();
    table.jsonb('tool_args').notNullable();

    table
      .string('status', 16)
      .notNullable()
      .defaultTo('pending')
      .checkIn(APPROVAL_STATUSES, 'ai_approvals_status_check');

    table.timestamp('decided_at', { useTz: true }).nullable();

    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, tableName);

  await knex.raw(`
    CREATE INDEX ai_approvals_company_status_created_at_desc_idx
    ON ${tableName} (company_id, status, created_at DESC)
    WHERE is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX ai_approvals_company_requested_by_created_at_desc_idx
    ON ${tableName} (company_id, requested_by_user_id, created_at DESC)
    WHERE is_deleted = false;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
