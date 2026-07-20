import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const schemaName = 'app';
const PREDICTIONS_TABLE = 'categorization_predictions';
const CANDIDATES_TABLE = 'categorization_candidates';
const CANDIDATE_LINES_TABLE = 'categorization_candidate_lines';

const CANDIDATE_REVIEW_STATES = ['pending_review', 'closed'] as const;

function qualifiedTable(tableName: string): string {
  return `"${schemaName}"."${tableName}"`;
}

function schemaTable(tableName: string): string {
  return `${schemaName}.${tableName}`;
}

function schemaType(typeName: string): string {
  return `"${schemaName}"."${typeName}"`;
}

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema(schemaName)
    .createTable(CANDIDATES_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
      table
        .uuid('categorization_task_id')
        .notNullable()
        .references('id')
        .inTable(schemaTable('categorization_tasks'))
        .onDelete('CASCADE');
      table.uuid('run_id').notNullable();
      table.uuid('bank_transaction_id').notNullable();
      table.date('bank_transaction_date').notNullable();
      table
        .uuid('prediction_id')
        .notNullable()
        .references('id')
        .inTable(schemaTable(PREDICTIONS_TABLE))
        .onDelete('CASCADE');
      table
        .uuid('company_id')
        .notNullable()
        .references('id')
        .inTable(schemaTable('companies'))
        .onDelete('CASCADE');
      table
        .specificType('source', schemaType('txn_categorization_source'))
        .notNullable();
      table.uuid('contact_id').nullable();
      table.specificType('contact_type', schemaType('contact_type')).nullable();
      table.string('description').nullable();
      table.string('reference').nullable();
      table.decimal('confidence', 5, 4).notNullable().defaultTo(0);
      table
        .string('review_state', 24)
        .notNullable()
        .defaultTo('pending_review')
        .checkIn(
          [...CANDIDATE_REVIEW_STATES],
          'cat_candidates_review_state_chk',
        );
      table.text('solver_notes').nullable();
      table.uuid('assignee_id').nullable();
      table.text('explanation').nullable();
      table.specificType('explanation_tokens', 'TEXT[]').nullable();
      table.jsonb('metadata').nullable();
      table
        .uuid('updated_by_id')
        .nullable()
        .references('id')
        .inTable(schemaTable('users'))
        .onDelete('SET NULL');
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

      table
        .foreign(
          ['contact_id', 'company_id'],
          'categorization_candidates_contact_company_fk',
        )
        .references(['id', 'company_id'])
        .inTable(schemaTable('contacts'))
        .onDelete('RESTRICT');
    });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedTable(CANDIDATES_TABLE)} IS
    'Current review state for promoted categorization suggestions; immutable suggestion facts live on candidate lines and lifecycle facts live on dispositions/outcomes.';
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedTable(CANDIDATES_TABLE)}
      ADD CONSTRAINT cat_candidates_deleted_state_chk
        CHECK (
          (is_deleted = false AND deleted_at IS NULL)
          OR (is_deleted = true AND deleted_at IS NOT NULL)
        ),
      ADD CONSTRAINT cat_candidates_bank_tx_fk
        FOREIGN KEY (bank_transaction_id)
        REFERENCES ${qualifiedTable('bank_transactions')} (id)
        ON DELETE CASCADE;
  `);

  await createUpdateTimestampTrigger(knex, CANDIDATES_TABLE, schemaName);
  await knex.raw(`
    CREATE INDEX idx_cat_candidates_task
      ON ${qualifiedTable(CANDIDATES_TABLE)} (categorization_task_id)
      WHERE is_deleted = FALSE;

    CREATE INDEX idx_cat_candidates_company
      ON ${qualifiedTable(CANDIDATES_TABLE)} (company_id)
      WHERE is_deleted = FALSE;

    CREATE INDEX idx_cat_candidates_bank_tx
      ON ${qualifiedTable(CANDIDATES_TABLE)} (bank_transaction_id)
      WHERE is_deleted = FALSE;

    CREATE UNIQUE INDEX idx_cat_candidates_pending_review_bank_tx
      ON ${qualifiedTable(CANDIDATES_TABLE)} (bank_transaction_id)
      WHERE is_deleted = FALSE AND review_state = 'pending_review';
  `);

  await knex.schema
    .withSchema(schemaName)
    .createTable(CANDIDATE_LINES_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
      table
        .uuid('candidate_id')
        .notNullable()
        .references('id')
        .inTable(schemaTable(CANDIDATES_TABLE))
        .onDelete('CASCADE');
      table.date('fs_date').notNullable();
      table
        .uuid('source_currency_id')
        .references('id')
        .inTable(schemaTable('currencies'))
        .notNullable();
      table.decimal('signed_native_amount', 18, 3).notNullable();
      table.decimal('system_exchange_rate', 32, 10).notNullable();
      table.decimal('custom_exchange_rate', 32, 10).notNullable();
      table
        .specificType(
          'signed_reporting_amount',
          'numeric(18, 3) GENERATED ALWAYS AS (signed_native_amount * custom_exchange_rate) STORED',
        )
        .notNullable();
      table
        .specificType('transaction_side', schemaType('debit_credit'))
        .notNullable();
      table.uuid('coa_id').notNullable();
      table.string('coa_name').nullable();
      table.string('description').nullable();
      table.uuid('project_id').nullable();
      table.string('project_name').nullable();
      table
        .uuid('contact_id')
        .nullable()
        .references('id')
        .inTable(schemaTable('contacts'))
        .onDelete('SET NULL');
      table.specificType('contact_type', schemaType('contact_type')).nullable();
      table.string('contact_name').nullable();
      table.boolean('is_bank_leg').notNullable().defaultTo(false);
      table
        .specificType(
          'split_type',
          schemaType('categorization_line_split_type'),
        )
        .nullable();
      table.decimal('split_value', 20, 10).nullable();
      table.text('explanation').nullable();
      table.jsonb('metadata').nullable();
      table.specificType(
        'search_text',
        `TEXT GENERATED ALWAYS AS (
          trim(both ' ' from lower(
            coalesce(description, '') || ' ' ||
            coalesce(contact_name, '') || ' ' ||
            coalesce(coa_name, '') || ' ' ||
            coalesce(project_name, '')
          ))
        ) STORED`,
      );
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
    });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedTable(CANDIDATE_LINES_TABLE)} IS
    'Line-level accounting facts captured from promoted categorization suggestions.';
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedTable(CANDIDATE_LINES_TABLE)}
      ADD CONSTRAINT cat_candidate_lines_deleted_state_chk
        CHECK (
          (is_deleted = false AND deleted_at IS NULL)
          OR (is_deleted = true AND deleted_at IS NOT NULL)
        );
  `);

  await createUpdateTimestampTrigger(knex, CANDIDATE_LINES_TABLE, schemaName);
  await knex.raw(`
    CREATE INDEX idx_cat_candidate_lines_candidate
      ON ${qualifiedTable(CANDIDATE_LINES_TABLE)} (candidate_id);

    CREATE INDEX idx_cat_candidate_lines_active_coa
      ON ${qualifiedTable(CANDIDATE_LINES_TABLE)} (coa_id)
      WHERE is_deleted = FALSE;

    CREATE INDEX idx_cat_candidate_lines_search_trgm
      ON ${qualifiedTable(CANDIDATE_LINES_TABLE)}
      USING GIN ((CASE WHEN is_deleted = FALSE THEN search_text END) gin_trgm_ops);
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedTable('ledger_transactions')}
      ADD CONSTRAINT ledger_transactions_categorization_candidate_id_foreign
      FOREIGN KEY (categorization_candidate_id)
      REFERENCES ${qualifiedTable(CANDIDATES_TABLE)} (id)
      ON DELETE SET NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE ${qualifiedTable('ledger_transactions')}
    DROP CONSTRAINT IF EXISTS ledger_transactions_categorization_candidate_id_foreign;
  `);

  await knex.raw(`
    DROP INDEX IF EXISTS "${schemaName}".idx_cat_candidate_lines_search_trgm;
    DROP INDEX IF EXISTS "${schemaName}".idx_cat_candidate_lines_active_coa;
    DROP INDEX IF EXISTS "${schemaName}".idx_cat_candidate_lines_candidate;
  `);
  await dropUpdateTimestampTrigger(knex, CANDIDATE_LINES_TABLE, schemaName);
  await knex.schema
    .withSchema(schemaName)
    .dropTableIfExists(CANDIDATE_LINES_TABLE);

  await knex.raw(`
    DROP INDEX IF EXISTS "${schemaName}".idx_cat_candidates_pending_review_bank_tx;
    DROP INDEX IF EXISTS "${schemaName}".idx_cat_candidates_bank_tx;
    DROP INDEX IF EXISTS "${schemaName}".idx_cat_candidates_company;
    DROP INDEX IF EXISTS "${schemaName}".idx_cat_candidates_task;
  `);
  await dropUpdateTimestampTrigger(knex, CANDIDATES_TABLE, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(CANDIDATES_TABLE);
}
