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
const CONSTRAINT_VIOLATIONS_TABLE = 'categorization_constraint_violations';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(PREDICTIONS_TABLE, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .uuid('categorization_task_id')
      .notNullable()
      .references('id')
      .inTable('categorization_tasks')
      .onDelete('CASCADE');
    table.uuid('bank_transaction_id').notNullable();
    table.date('bank_transaction_date').notNullable();
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table
      .enu('source', ['rule', 'ml'], {
        useNative: false,
        enumName: 'categorization_prediction_source',
      })
      .notNullable();
    table.integer('rank').notNullable().defaultTo(1);
    table.boolean('is_primary').notNullable().defaultTo(true);
    table.decimal('confidence', 5, 4).notNullable().defaultTo(0);
    table.string('model_version', 64).nullable();
    table.uuid('prediction_group_id').nullable();
    table
      .enu('status', ['pending', 'accepted', 'rejected', 'superseded'], {
        useNative: false,
        enumName: 'categorization_prediction_status',
      })
      .notNullable()
      .defaultTo('pending');
    table.string('input_checksum', 64).nullable();
    table.jsonb('explanation').nullable();
    table.jsonb('metadata').nullable();
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
    table.smallint('line_rank').notNullable();
    table
      .enu('entry_type', ['debit', 'credit'], {
        useNative: false,
        enumName: 'categorization_prediction_entry_type',
      })
      .notNullable();
    table.uuid('coa_id').notNullable();
    table.uuid('project_id').nullable();
    table.decimal('amount_native', 20, 6).notNullable();
    table.decimal('amount_reporting', 20, 6).nullable();
    table.string('currency_code', 3).notNullable();
    table.string('description', 255).nullable();
    table
      .enu('split_type', ['bank', 'amount', 'percentage', 'remainder'], {
        useNative: false,
        enumName: 'categorization_prediction_split_type',
      })
      .notNullable();
    table.decimal('split_value', 20, 10).nullable();
    table.jsonb('metadata').nullable();
    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, PREDICTION_LINES_TABLE);
  await knex.raw(
    `CREATE INDEX idx_cat_prediction_lines_prediction ON ${PREDICTION_LINES_TABLE}(prediction_id);`,
  );

  await knex.schema.createTable(CANDIDATES_TABLE, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .uuid('prediction_id')
      .notNullable()
      .references('id')
      .inTable(PREDICTIONS_TABLE)
      .onDelete('CASCADE');
    table
      .uuid('categorization_task_id')
      .notNullable()
      .references('id')
      .inTable('categorization_tasks')
      .onDelete('CASCADE');
    table.uuid('bank_transaction_id').notNullable();
    table.date('bank_transaction_date').notNullable();
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table
      .enu(
        'status',
        ['proposed', 'validated', 'rejected', 'posted', 'superseded'],
        {
          useNative: false,
          enumName: 'categorization_candidate_status',
        },
      )
      .notNullable()
      .defaultTo('proposed');
    table.date('posting_date').nullable();
    table.decimal('confidence', 5, 4).notNullable().defaultTo(0);
    table.uuid('contact_id').nullable();
    table.string('description', 255).nullable();
    table.string('reference', 255).nullable();
    table.text('solver_notes').nullable();
    table.uuid('assignee_id').nullable();
    table.jsonb('metadata').nullable();
    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, CANDIDATES_TABLE);
  await knex.raw(
    `CREATE INDEX idx_cat_candidates_task ON ${CANDIDATES_TABLE}(categorization_task_id) WHERE is_deleted = FALSE;`,
  );
  await knex.raw(
    `CREATE INDEX idx_cat_candidates_company ON ${CANDIDATES_TABLE}(company_id) WHERE is_deleted = FALSE;`,
  );

  await knex.schema.createTable(CANDIDATE_LINES_TABLE, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .uuid('candidate_id')
      .notNullable()
      .references('id')
      .inTable(CANDIDATES_TABLE)
      .onDelete('CASCADE');
    table.smallint('line_rank').notNullable();
    table
      .enu('entry_type', ['debit', 'credit'], {
        useNative: false,
        enumName: 'categorization_candidate_entry_type',
      })
      .notNullable();
    table.uuid('coa_id').notNullable();
    table.uuid('project_id').nullable();
    table.decimal('amount_native', 20, 6).notNullable();
    table.decimal('amount_reporting', 20, 6).nullable();
    table.string('currency_code', 3).notNullable();
    table.string('description', 255).nullable();
    table
      .enu('split_type', ['bank', 'amount', 'percentage', 'remainder'], {
        useNative: false,
        enumName: 'categorization_candidate_split_type',
      })
      .notNullable();
    table.decimal('split_value', 20, 10).nullable();
    table.jsonb('metadata').nullable();
    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, CANDIDATE_LINES_TABLE);
  await knex.raw(
    `CREATE INDEX idx_cat_candidate_lines_candidate ON ${CANDIDATE_LINES_TABLE}(candidate_id);`,
  );

  await knex.schema.createTable(CONSTRAINT_VIOLATIONS_TABLE, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .uuid('candidate_id')
      .notNullable()
      .references('id')
      .inTable(CANDIDATES_TABLE)
      .onDelete('CASCADE');
    table.string('violation_type', 64).notNullable();
    table
      .enu('severity', ['info', 'warning', 'error'], {
        useNative: false,
        enumName: 'categorization_violation_severity',
      })
      .notNullable()
      .defaultTo('error');
    table.text('message').notNullable();
    table.boolean('resolved').notNullable().defaultTo(false);
    table.jsonb('metadata').nullable();
    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, CONSTRAINT_VIOLATIONS_TABLE);
  await knex.raw(
    `CREATE INDEX idx_cat_constraint_candidate ON ${CONSTRAINT_VIOLATIONS_TABLE}(candidate_id);`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_cat_constraint_candidate;`);
  await dropUpdateTimestampTrigger(knex, CONSTRAINT_VIOLATIONS_TABLE);
  await knex.schema.dropTableIfExists(CONSTRAINT_VIOLATIONS_TABLE);

  await knex.raw(`DROP INDEX IF EXISTS idx_cat_candidate_lines_candidate;`);
  await dropUpdateTimestampTrigger(knex, CANDIDATE_LINES_TABLE);
  await knex.schema.dropTableIfExists(CANDIDATE_LINES_TABLE);

  await knex.raw(`DROP INDEX IF EXISTS idx_cat_candidates_company;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_cat_candidates_task;`);
  await dropUpdateTimestampTrigger(knex, CANDIDATES_TABLE);
  await knex.schema.dropTableIfExists(CANDIDATES_TABLE);

  await knex.raw(`DROP INDEX IF EXISTS idx_cat_prediction_lines_prediction;`);
  await dropUpdateTimestampTrigger(knex, PREDICTION_LINES_TABLE);
  await knex.schema.dropTableIfExists(PREDICTION_LINES_TABLE);

  await knex.raw(`DROP INDEX IF EXISTS idx_cat_predictions_company;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_cat_predictions_task;`);
  await dropUpdateTimestampTrigger(knex, PREDICTIONS_TABLE);
  await knex.schema.dropTableIfExists(PREDICTIONS_TABLE);
}
