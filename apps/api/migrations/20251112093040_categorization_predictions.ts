import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const schemaName = 'app';
const PREDICTIONS_TABLE = 'categorization_predictions';
const PREDICTION_LINES_TABLE = 'categorization_prediction_lines';

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
    .createTable(PREDICTIONS_TABLE, (table) => {
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
          'categorization_predictions_contact_company_fk',
        )
        .references(['id', 'company_id'])
        .inTable(schemaTable('contacts'))
        .onDelete('RESTRICT');
    });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedTable(PREDICTIONS_TABLE)} IS
    'Immutable-ish snapshots of categorization model or rule suggestions before they are promoted into review candidates.';
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedTable(PREDICTIONS_TABLE)}
      ADD CONSTRAINT cat_predictions_deleted_state_chk
        CHECK (
          (is_deleted = false AND deleted_at IS NULL)
          OR (is_deleted = true AND deleted_at IS NOT NULL)
        ),
      ADD CONSTRAINT cat_predictions_bank_tx_fk
        FOREIGN KEY (bank_transaction_id)
        REFERENCES ${qualifiedTable('bank_transactions')} (id)
        ON DELETE CASCADE;
  `);

  await createUpdateTimestampTrigger(knex, PREDICTIONS_TABLE, schemaName);
  await knex.raw(`
    CREATE INDEX idx_cat_predictions_task
      ON ${qualifiedTable(PREDICTIONS_TABLE)} (categorization_task_id)
      WHERE is_deleted = FALSE;

    CREATE INDEX idx_cat_predictions_company
      ON ${qualifiedTable(PREDICTIONS_TABLE)} (company_id)
      WHERE is_deleted = FALSE;

    CREATE INDEX idx_cat_predictions_bank_tx
      ON ${qualifiedTable(PREDICTIONS_TABLE)} (bank_transaction_id)
      WHERE is_deleted = FALSE;

    CREATE INDEX idx_cat_predictions_task_run
      ON ${qualifiedTable(PREDICTIONS_TABLE)} (categorization_task_id, run_id, created_at DESC)
      WHERE is_deleted = FALSE;

    CREATE INDEX idx_cat_predictions_run
      ON ${qualifiedTable(PREDICTIONS_TABLE)} (run_id)
      WHERE is_deleted = FALSE;
  `);

  await knex.schema
    .withSchema(schemaName)
    .createTable(PREDICTION_LINES_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
      table
        .uuid('prediction_id')
        .notNullable()
        .references('id')
        .inTable(schemaTable(PREDICTIONS_TABLE))
        .onDelete('CASCADE');
      table.uuid('coa_id').notNullable();
      table.uuid('project_id').nullable();
      table.uuid('contact_id').nullable();
      table.specificType('contact_type', schemaType('contact_type')).nullable();
      table.decimal('signed_native_amount', 20, 6).notNullable();
      table.string('description', 255).nullable();
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
    COMMENT ON TABLE ${qualifiedTable(PREDICTION_LINES_TABLE)} IS
    'Line-level accounting facts suggested by categorization predictions.';
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedTable(PREDICTION_LINES_TABLE)}
      ADD CONSTRAINT cat_prediction_lines_deleted_state_chk
        CHECK (
          (is_deleted = false AND deleted_at IS NULL)
          OR (is_deleted = true AND deleted_at IS NOT NULL)
        );
  `);

  await createUpdateTimestampTrigger(knex, PREDICTION_LINES_TABLE, schemaName);
  await knex.raw(`
    CREATE INDEX idx_cat_prediction_lines_prediction
      ON ${qualifiedTable(PREDICTION_LINES_TABLE)} (prediction_id);

    CREATE INDEX idx_cat_prediction_lines_active_coa
      ON ${qualifiedTable(PREDICTION_LINES_TABLE)} (coa_id)
      WHERE is_deleted = FALSE;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP INDEX IF EXISTS "${schemaName}".idx_cat_prediction_lines_active_coa;
    DROP INDEX IF EXISTS "${schemaName}".idx_cat_prediction_lines_prediction;
  `);
  await dropUpdateTimestampTrigger(knex, PREDICTION_LINES_TABLE, schemaName);
  await knex.schema
    .withSchema(schemaName)
    .dropTableIfExists(PREDICTION_LINES_TABLE);

  await knex.raw(`
    DROP INDEX IF EXISTS "${schemaName}".idx_cat_predictions_run;
    DROP INDEX IF EXISTS "${schemaName}".idx_cat_predictions_task_run;
    DROP INDEX IF EXISTS "${schemaName}".idx_cat_predictions_bank_tx;
    DROP INDEX IF EXISTS "${schemaName}".idx_cat_predictions_company;
    DROP INDEX IF EXISTS "${schemaName}".idx_cat_predictions_task;
  `);
  await dropUpdateTimestampTrigger(knex, PREDICTIONS_TABLE, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(PREDICTIONS_TABLE);
}
