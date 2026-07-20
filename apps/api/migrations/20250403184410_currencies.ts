import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Currencies define the canonical platform-owned currency catalog used
 * across reporting, billing, banking, and journal workflows.
 */

const schemaName = 'app';
const tableName = 'currencies';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('code', 3).unique().notNullable();
    table.string('name', 100).notNullable();
    table.string('symbol', 8).notNullable();
    table
      .integer('minor_unit')
      .notNullable()
      .checkBetween([0, 4], 'currencies_minor_unit_range_chk');

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
    ADD CONSTRAINT currencies_code_normalized_chk
    CHECK (code = upper(btrim(code)) AND code ~ '^[A-Z]{3}$')
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT currencies_name_trimmed_chk
    CHECK (name = btrim(name) AND char_length(name) >= 2)
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT currencies_symbol_trimmed_chk
    CHECK (symbol = btrim(symbol) AND char_length(symbol) >= 1)
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
