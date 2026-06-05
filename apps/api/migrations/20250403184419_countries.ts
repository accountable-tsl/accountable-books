import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Countries define the canonical platform-owned country catalog used
 * across company provisioning, billing, banking, and demo workflows.
 */

const schemaName = 'app';
const tableName = 'countries';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('code', 2).unique().notNullable();
    table.string('name', 128).notNullable();
    table.string('phone_code', 15).notNullable();
    table.string('flag', 10).nullable();
    table.string('continent', 50).nullable();

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT countries_code_normalized_chk
    CHECK (code = upper(btrim(code)) AND code ~ '^[A-Z]{2}$')
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT countries_name_trimmed_chk
    CHECK (name = btrim(name) AND char_length(name) >= 2)
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT countries_phone_code_normalized_chk
    CHECK (
      phone_code = btrim(phone_code)
      AND phone_code ~ '^\\+[0-9]{1,14}$'
    )
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT countries_flag_trimmed_chk
    CHECK (flag IS NULL OR (flag = btrim(flag) AND char_length(flag) >= 1))
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT countries_continent_trimmed_chk
    CHECK (
      continent IS NULL
      OR (continent = btrim(continent) AND char_length(continent) >= 2)
    )
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
