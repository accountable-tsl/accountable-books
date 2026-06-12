import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const tableName = 'billing_plan_catalog';

const PLAN_FAMILIES = ['firm', 'business', 'individual'];
const PLAN_KINDS = ['free', 'paid', 'custom_contact'];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table.string('plan_key', 120).notNullable().unique();

    table
      .string('plan_family', 24)
      .notNullable()
      .checkIn(PLAN_FAMILIES, 'billing_plan_catalog_plan_family_check');

    table
      .string('plan_kind', 24)
      .notNullable()
      .checkIn(PLAN_KINDS, 'billing_plan_catalog_plan_kind_check');

    table.string('display_name', 160).notNullable();
    table.string('public_label', 160).nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.jsonb('metadata').nullable();

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
