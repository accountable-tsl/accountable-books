import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const schemaName = 'app';
const CANDIDATES_TABLE = 'categorization_candidates';
const CANDIDATE_OUTCOMES_TABLE = 'categorization_candidate_outcomes';

const CANDIDATE_OUTCOMES = [
  'accepted_as_suggested',
  'posted_with_edits',
  'independently_matched',
  'different',
  'not_comparable',
] as const;

function qualifiedTable(tableName: string): string {
  return `"${schemaName}"."${tableName}"`;
}

function schemaTable(tableName: string): string {
  return `${schemaName}.${tableName}`;
}

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema(schemaName)
    .createTable(CANDIDATE_OUTCOMES_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
      table
        .uuid('candidate_id')
        .notNullable()
        .references('id')
        .inTable(schemaTable(CANDIDATES_TABLE))
        .onDelete('CASCADE');
      table
        .uuid('bank_transaction_id')
        .notNullable()
        .references('id')
        .inTable(schemaTable('bank_transactions'))
        .onDelete('CASCADE');
      table
        .uuid('company_id')
        .notNullable()
        .references('id')
        .inTable(schemaTable('companies'))
        .onDelete('CASCADE');
      table
        .uuid('ledger_transaction_id')
        .notNullable()
        .references('id')
        .inTable(schemaTable('ledger_transactions'))
        .onDelete('RESTRICT');
      table
        .string('outcome', 40)
        .notNullable()
        .checkIn([...CANDIDATE_OUTCOMES], 'cat_candidate_outcomes_type_chk');
      table.text('comparison_basis').notNullable();
      table.jsonb('suggested_facts').notNullable();
      table.jsonb('posted_facts').notNullable();
      table
        .jsonb('differences')
        .notNullable()
        .defaultTo(knex.raw(`'[]'::jsonb`));
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
    COMMENT ON TABLE ${qualifiedTable(CANDIDATE_OUTCOMES_TABLE)} IS
    'One-per-candidate comparison of suggested accounting facts against final posted ledger facts.';
  `);

  await createUpdateTimestampTrigger(
    knex,
    CANDIDATE_OUTCOMES_TABLE,
    schemaName,
  );
  await knex.raw(`
    CREATE UNIQUE INDEX idx_cat_candidate_outcomes_candidate
      ON ${qualifiedTable(CANDIDATE_OUTCOMES_TABLE)} (candidate_id);

    CREATE INDEX idx_cat_candidate_outcomes_bank_tx
      ON ${qualifiedTable(CANDIDATE_OUTCOMES_TABLE)} (bank_transaction_id, updated_at DESC);

    CREATE INDEX idx_cat_candidate_outcomes_ledger_tx
      ON ${qualifiedTable(CANDIDATE_OUTCOMES_TABLE)} (ledger_transaction_id);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP INDEX IF EXISTS "${schemaName}".idx_cat_candidate_outcomes_ledger_tx;
    DROP INDEX IF EXISTS "${schemaName}".idx_cat_candidate_outcomes_bank_tx;
    DROP INDEX IF EXISTS "${schemaName}".idx_cat_candidate_outcomes_candidate;
  `);
  await dropUpdateTimestampTrigger(knex, CANDIDATE_OUTCOMES_TABLE, schemaName);
  await knex.schema
    .withSchema(schemaName)
    .dropTableIfExists(CANDIDATE_OUTCOMES_TABLE);
}
