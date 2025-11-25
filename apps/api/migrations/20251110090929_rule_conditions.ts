import type { Knex } from 'knex';
import { RULES_TABLE } from './20251110090928_rules.ts';

const tableName = 'rule_conditions';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .uuid('rule_id')
      .unique()
      .notNullable()
      .references('id')
      .inTable(RULES_TABLE)
      .onDelete('CASCADE');
    table.jsonb('definition').notNullable(); // entire condition definition JSON
    table.string('fingerprint', 64).unique().notNullable();
    table.text('summary_text').nullable();
    table.jsonb('field_usage').nullable(); // metadata describing referenced fields
  });

  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT rule_conditions_definition_valid
    CHECK (jsonb_typeof(definition) = 'object');
  `);

  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT rule_conditions_field_usage_valid
    CHECK (field_usage IS NULL OR jsonb_typeof(field_usage) = 'object');
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS rule_conditions_field_usage_valid;`,
  );
  await knex.raw(
    `ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS rule_conditions_definition_valid;`,
  );
  await knex.schema.dropTableIfExists(tableName);
}
