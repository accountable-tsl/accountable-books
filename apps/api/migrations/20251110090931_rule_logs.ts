import type { Knex } from 'knex';

import { RULES_TABLE } from './20251110090928_rules.js';
import { preventUpdateOrDelete } from './utils/db.js';

const tableName = 'rule_logs';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.uuid('engine_run_id').notNullable();
    table.uuid('company_id').notNullable();
    table
      .uuid('rule_id')
      .notNullable()
      .references('id')
      .inTable(RULES_TABLE)
      .onDelete('RESTRICT');
    table.uuid('transaction_id').notNullable();
    table.date('transaction_date').notNullable();
    table.integer('rule_version').notNullable();
    table.integer('rule_priority');
    table.specificType('rule_scope', 'rule_scope').notNullable();
    table.string('rule_name', 200).notNullable();

    table.string('condition_fingerprint', 64).nullable();
    table.string('action_fingerprint', 64).nullable();

    // explainability snapshots
    table.jsonb('matched_conditions').nullable();
    table.jsonb('applied_actions').nullable();
    table.string('txn_hash_before').nullable();
    table.string('txn_hash_after').nullable();
    table.jsonb('result_state').notNullable().defaultTo('{}'); // final draft state after this rule
    table.text('error_message').nullable();
    table
      .specificType('immutable_fields_after_rule', 'text[]')
      .nullable()
      .comment('Fields this rule mutated and locked from downstream changes');
    table
      .string('conflicting_field', 64)
      .nullable()
      .comment('Specific field that triggered an exclusive/conflict outcome');
    table.jsonb('debug_payload').nullable();

    table
      .enu('status', ['success', 'conflict', 'skipped', 'error'], {
        enumName: 'rule_log_status',
        useNative: true,
      })
      .notNullable();
    table
      .timestamp('executed_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.integer('duration_ms').nullable();

    table
      .foreign('transaction_id')
      .references('id')
      .inTable('bank_transactions')
      .onDelete('RESTRICT');
  });

  await preventUpdateOrDelete(knex, tableName);

  await knex.raw(`
  CREATE UNIQUE INDEX rule_logs_run_rule_uniq
  ON ${tableName} (engine_run_id, transaction_id, rule_id);
  `);

  await knex.raw(`
  CREATE INDEX idx_rule_logs_company_time
  ON ${tableName} (company_id, executed_at DESC);
  `);

  await knex.raw(`
  CREATE INDEX idx_rule_logs_status
  ON ${tableName} (status) WHERE status IN ('conflict','error');
  `);

  await knex.raw(`
  CREATE INDEX idx_rule_logs_transaction
  ON ${tableName} (transaction_id);
  `);

  // Basic JSON type checks
  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT rule_logs_json_types CHECK (
      (matched_conditions IS NULL OR jsonb_typeof(matched_conditions) = 'object') AND
      (applied_actions IS NULL OR jsonb_typeof(applied_actions) = 'object') AND
      (result_state IS NULL OR jsonb_typeof(result_state) = 'object') AND
      (debug_payload IS NULL OR jsonb_typeof(debug_payload) = 'object')
    );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS rule_logs_json_types;`,
  );
  await knex.raw(`DROP INDEX IF EXISTS idx_rule_logs_transaction;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_rule_logs_status;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_rule_logs_company_time;`);
  await knex.raw(`DROP INDEX IF EXISTS rule_logs_run_rule_uniq;`);
  await knex.raw(
    `DROP TRIGGER IF EXISTS prevent_update_or_delete_${tableName} ON ${tableName};`,
  );
  await knex.schema.dropTableIfExists(tableName);
  await knex.raw(`DROP TYPE IF EXISTS rule_log_status;`);
}
