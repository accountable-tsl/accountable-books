import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const PREDICTIONS_TABLE = 'categorization_predictions';
const PREDICTION_LINES_TABLE = 'categorization_prediction_lines';
const CANDIDATES_TABLE = 'categorization_candidates';
const CANDIDATE_LINES_TABLE = 'categorization_candidate_lines';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(PREDICTIONS_TABLE, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .uuid('categorization_task_id')
      .notNullable()
      .references('id')
      .inTable('categorization_tasks')
      .onDelete('CASCADE');
    table.uuid('run_id').notNullable();
    table.uuid('bank_transaction_id').notNullable();
    table.date('bank_transaction_date').notNullable();
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table.specificType('source', 'txn_categorization_source').notNullable();
    table
      .uuid('contact_id')
      .nullable()
      .references('id')
      .inTable('contacts')
      .onDelete('SET NULL');
    table.specificType('contact_type', 'contact_type').nullable();
    table.string('description').nullable();
    table.string('reference').nullable();
    table.date('ledger_date').nullable();
    table.decimal('confidence', 5, 4).notNullable().defaultTo(0);
    table.string('model_version', 64).nullable();
    table.string('input_checksum', 64).nullable();
    table.text('explanation').nullable();
    table.specificType('explanation_tokens', 'TEXT[]').nullable();
    table.jsonb('metadata').nullable();
    table
      .uuid('updated_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, PREDICTIONS_TABLE);
  await knex.raw(
    `CREATE INDEX idx_cat_predictions_task ON ${PREDICTIONS_TABLE}(categorization_task_id) WHERE is_deleted = FALSE;`,
  );
  await knex.raw(
    `CREATE INDEX idx_cat_predictions_company ON ${PREDICTIONS_TABLE}(company_id) WHERE is_deleted = FALSE;`,
  );

  await knex.schema.createTable(PREDICTION_LINES_TABLE, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .uuid('prediction_id')
      .notNullable()
      .references('id')
      .inTable(PREDICTIONS_TABLE)
      .onDelete('CASCADE');
    table.uuid('coa_id').notNullable();
    table.uuid('project_id').nullable();

    table
      .uuid('contact_id')
      .nullable()
      .references('id')
      .inTable('contacts')
      .onDelete('SET NULL');
    table.specificType('contact_type', 'contact_type').nullable();

    table.decimal('signed_native_amount', 20, 6).notNullable();
    table.string('description', 255).nullable();
    table.boolean('is_bank_leg').notNullable().defaultTo(false);
    table
      .specificType('split_type', 'categorization_line_split_type')
      .nullable();
    table.decimal('split_value', 20, 10).nullable();
    table.text('explanation').nullable();
    table.jsonb('metadata').nullable();
    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, PREDICTION_LINES_TABLE);
  await knex.raw(
    `CREATE INDEX idx_cat_prediction_lines_prediction ON ${PREDICTION_LINES_TABLE}(prediction_id);`,
  );

  await knex.raw(
    `CREATE INDEX idx_cat_predictions_bank_tx ON ${PREDICTIONS_TABLE}(bank_transaction_id, bank_transaction_date) WHERE is_deleted = FALSE;`,
  );

  // Composite FK from predictions to bank_transactions (id + date)
  await knex.raw(`
    ALTER TABLE ${PREDICTIONS_TABLE}
    ADD CONSTRAINT cat_predictions_bank_tx_fk
    FOREIGN KEY (bank_transaction_id, bank_transaction_date)
    REFERENCES bank_transactions (id, date)
    ON DELETE CASCADE;
  `);

  // Indexes for run tracking
  await knex.raw(
    `CREATE INDEX idx_cat_predictions_task_run ON ${PREDICTIONS_TABLE}(categorization_task_id, run_id, created_at DESC) WHERE is_deleted = FALSE;`,
  );

  await knex.raw(
    `CREATE INDEX idx_cat_predictions_run ON ${PREDICTIONS_TABLE}(run_id) WHERE is_deleted = FALSE;`,
  );

  await knex.schema.createTable(CANDIDATES_TABLE, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .uuid('categorization_task_id')
      .notNullable()
      .references('id')
      .inTable('categorization_tasks')
      .onDelete('CASCADE');
    table.uuid('run_id').notNullable();
    table.uuid('bank_transaction_id').notNullable();
    table.date('bank_transaction_date').notNullable();
    table
      .uuid('prediction_id')
      .notNullable()
      .references('id')
      .inTable(PREDICTIONS_TABLE)
      .onDelete('CASCADE');
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table.specificType('source', 'txn_categorization_source').notNullable();
    table
      .uuid('contact_id')
      .nullable()
      .references('id')
      .inTable('contacts')
      .onDelete('SET NULL');
    table.specificType('contact_type', 'contact_type').nullable();
    table.string('description').nullable();
    table.string('reference').nullable();
    table.decimal('confidence', 5, 4).notNullable().defaultTo(0);
    table.text('solver_notes').nullable();
    table.uuid('assignee_id').nullable();
    table.text('explanation').nullable();
    table.specificType('explanation_tokens', 'TEXT[]').nullable();
    table.jsonb('metadata').nullable();
    table
      .uuid('updated_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, CANDIDATES_TABLE);
  await knex.raw(
    `CREATE INDEX idx_cat_candidates_task ON ${CANDIDATES_TABLE}(categorization_task_id) WHERE is_deleted = FALSE;`,
  );
  await knex.raw(
    `CREATE INDEX idx_cat_candidates_company ON ${CANDIDATES_TABLE}(company_id) WHERE is_deleted = FALSE;`,
  );

  await knex.raw(
    `CREATE INDEX idx_cat_candidates_bank_tx ON ${CANDIDATES_TABLE}(bank_transaction_id, bank_transaction_date) WHERE is_deleted = FALSE;`,
  );

  await knex.schema.createTable(CANDIDATE_LINES_TABLE, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .uuid('candidate_id')
      .notNullable()
      .references('id')
      .inTable(CANDIDATES_TABLE)
      .onDelete('CASCADE');
    table.date('fs_date').notNullable();
    table
      .uuid('source_currency_id')
      .references('id')
      .inTable('currencies')
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

    table.specificType('transaction_side', 'debit_credit').notNullable();
    table.uuid('coa_id').notNullable();
    table.string('description').nullable();
    table.uuid('project_id').nullable();

    table
      .uuid('contact_id')
      .nullable()
      .references('id')
      .inTable('contacts')
      .onDelete('SET NULL');
    table.specificType('contact_type', 'contact_type').nullable();

    // table.decimal('amount_native', 20, 6).notNullable();
    // table.string('currency_code', 3).notNullable();
    // Marks deterministic bank leg so UI can hide it for the owning bank account
    table.boolean('is_bank_leg').notNullable().defaultTo(false);
    table
      .specificType('split_type', 'categorization_line_split_type')
      .nullable();
    table.decimal('split_value', 20, 10).nullable();
    table.text('explanation').nullable();
    table.jsonb('metadata').nullable();
    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, CANDIDATE_LINES_TABLE);
  await knex.raw(
    `CREATE INDEX idx_cat_candidate_lines_candidate ON ${CANDIDATE_LINES_TABLE}(candidate_id);`,
  );

  // Composite FK from candidates to bank_transactions (id + date)
  await knex.raw(`
    ALTER TABLE ${CANDIDATES_TABLE}
    ADD CONSTRAINT cat_candidates_bank_tx_fk
    FOREIGN KEY (bank_transaction_id, bank_transaction_date)
    REFERENCES bank_transactions (id, date)
    ON DELETE CASCADE;
  `);

  // FK from ledger_transactions to categorization_candidates
  await knex.raw(`
    ALTER TABLE ledger_transactions
    ADD CONSTRAINT ledger_transactions_categorization_candidate_id_foreign
    FOREIGN KEY (categorization_candidate_id)
    REFERENCES ${CANDIDATES_TABLE} (id)
    ON DELETE SET NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop FK from ledger_transactions to categorization_candidates
  await knex.raw(`
    ALTER TABLE ledger_transactions
    DROP CONSTRAINT IF EXISTS ledger_transactions_categorization_candidate_id_foreign;
  `);

  await knex.raw(`DROP INDEX IF EXISTS idx_cat_constraint_candidate;`);

  await knex.raw(`DROP INDEX IF EXISTS idx_cat_candidate_lines_candidate;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_cat_candidates_bank_tx;`);
  await dropUpdateTimestampTrigger(knex, CANDIDATE_LINES_TABLE);
  await knex.schema.dropTableIfExists(CANDIDATE_LINES_TABLE);

  await knex.raw(`DROP INDEX IF EXISTS idx_cat_candidates_company;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_cat_candidates_task;`);
  await dropUpdateTimestampTrigger(knex, CANDIDATES_TABLE);
  await knex.schema.dropTableIfExists(CANDIDATES_TABLE);

  await knex.raw(`DROP INDEX IF EXISTS idx_cat_prediction_lines_prediction;`);
  await dropUpdateTimestampTrigger(knex, PREDICTION_LINES_TABLE);
  await knex.schema.dropTableIfExists(PREDICTION_LINES_TABLE);

  await knex.raw(`DROP INDEX IF EXISTS idx_cat_predictions_run;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_cat_predictions_task_run;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_cat_predictions_bank_tx;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_cat_predictions_company;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_cat_predictions_task;`);
  await dropUpdateTimestampTrigger(knex, PREDICTIONS_TABLE);
  await knex.schema.dropTableIfExists(PREDICTIONS_TABLE);
}
