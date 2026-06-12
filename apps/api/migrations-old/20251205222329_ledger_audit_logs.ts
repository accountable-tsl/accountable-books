import type { Knex } from 'knex';

const LEDGER_EVENT_TYPES = [
  'ledger_posted_auto', // Auto-post happened (from candidate to ledger, no human touch)
  'ledger_posted_manual', // Manual posting by user

  'metadata_updated', // Non-accounting metadata updated

  'ledger_superseded', // Old ledger transaction was replaced by a new one
  'ledger_split_created', // Split happened
  'ledger_reversed', // Ledger reversed, maybe one coming from a manual journal that was reversed

  'ledger_marked_reviewed',
  'ledger_marked_unreviewed',
];

const tableName = 'ledger_audit_logs';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .uuid('ledger_transaction_id')
      .notNullable()
      .references('id')
      .inTable('ledger_transactions')
      .onDelete('RESTRICT');
    table.specificType('ledger_entry_ids', 'uuid[]').nullable();

    // Actor (user or system)
    table
      .uuid('actor_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.string('actor_type', 50).nullable(); // 'user', 'system', etc.

    table
      .string('event_type', 50)
      .checkIn(LEDGER_EVENT_TYPES, 'ledger_audit_logs_event_type_check')
      .notNullable();
    table
      .timestamp('event_timestamp', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // Link to categorization task if applicable
    table
      .uuid('categorization_task_id')
      .nullable()
      .references('id')
      .inTable('categorization_tasks')
      .onDelete('SET NULL');

    table.text('comment').nullable();
    table.jsonb('metadata').nullable();

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  // Essential index: primary lookup by ledger_transaction_id
  await knex.raw(`
    CREATE INDEX idx_ledger_audit_logs_transaction 
    ON ${tableName}(ledger_transaction_id, event_timestamp DESC);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(tableName);
}
