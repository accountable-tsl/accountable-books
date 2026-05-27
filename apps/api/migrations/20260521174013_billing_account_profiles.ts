import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const tableName = 'billing_account_profiles';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('billing_account_id')
      .notNullable()
      .references('id')
      .inTable('billing_accounts')
      .onDelete('CASCADE');

    table.string('legal_entity_name', 256).notNullable();
    table.string('billing_email', 320).notNullable();
    table.string('billing_country_code', 2).notNullable();

    table.string('tax_id', 64).nullable();
    table.string('tax_id_type', 32).nullable();
    table.string('tax_exemption_code', 64).nullable();

    table.jsonb('address_json').nullable();

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

  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT billing_account_profiles_billing_country_code_check
    CHECK (billing_country_code ~ '^[A-Z]{2}$');
  `);

  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT billing_account_profiles_address_json_check
    CHECK (
      address_json IS NULL
      OR jsonb_typeof(address_json) = 'object'
    );
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX billing_account_profiles_billing_account_id_unique_idx
    ON ${tableName} (billing_account_id);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
