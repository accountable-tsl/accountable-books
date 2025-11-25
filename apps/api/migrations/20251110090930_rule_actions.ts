import type { Knex } from 'knex';
import { RULES_TABLE } from './20251110090928_rules.ts';

const tableName = 'rule_actions';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    t.uuid('rule_id')
      .unique()
      .notNullable()
      .references('id')
      .inTable(RULES_TABLE)
      .onDelete('CASCADE');
    t.jsonb('definition').notNullable(); // stores ActionGroup JSON
    t.string('fingerprint', 64).unique().notNullable(); // SHA-256 of definition snapshot
    t.specificType('protected_action_fields', 'text[]')
      .notNullable()
      .defaultTo('{}')
      .comment(
        'Action targets this rule treats as exclusive at its tier/priority',
      );
  });

  await knex.raw(`
    CREATE INDEX idx_rule_actions_rule ON ${tableName} (rule_id);
  `);

  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT rule_actions_definition_valid
    CHECK (jsonb_typeof(definition) = 'object');
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS rule_actions_definition_valid;`,
  );
  await knex.raw(`DROP INDEX IF EXISTS idx_rule_actions_rule;`);
  await knex.schema.dropTableIfExists(tableName);
}
