import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const eventStage = [
  'workflow',
  'enrichment',
  'rule_engine',
  'ml_engine',
  'validation',
  'candidate',
];

const eventTypes = [
  'categorization_task_created',
  'rules_started',
  'rules_applied',
  'rules_no_match',
  'rules_conflict',
  'rules_error',
  'rules_failed',
  'ml_enqueued',
  'ml_started',
  'ml_completed',
  'ml_failed',
  'prediction_created',
  'constraint_validation_failed',
  'candidate_created',
  'candidate_ignored',
  'candidate_replaced',

  'candidate_accepted',
  'candidate_rejected',
];
const tableName = 'categorization_task_events';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .uuid('categorization_task_id')
      .notNullable()
      .references('id')
      .inTable('categorization_tasks')
      .onDelete('CASCADE');
    table.uuid('run_id').notNullable();
    table
      .string('event_stage')
      .checkIn(eventStage, 'categorization_task_event_stage')
      .notNullable();
    table
      .string('event_type')
      .checkIn(eventTypes, 'categorization_task_event_type')
      .notNullable();

    table
      .timestamp('event_timestamp', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.text('comment').nullable();
    table.jsonb('metadata').nullable();
    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, tableName);

  // Indexes
  await knex.raw(
    `CREATE INDEX idx_task_events_task ON ${tableName}(categorization_task_id, event_timestamp DESC) WHERE is_deleted = FALSE;`,
  );
  await knex.raw(
    `CREATE INDEX idx_task_events_run ON ${tableName}(run_id) WHERE is_deleted = FALSE;`,
  );
  await knex.raw(
    `CREATE INDEX idx_task_events_stage_type ON ${tableName}(event_stage, event_type) WHERE is_deleted = FALSE;`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_task_events_stage_type;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_task_events_run;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_task_events_task;`);
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
