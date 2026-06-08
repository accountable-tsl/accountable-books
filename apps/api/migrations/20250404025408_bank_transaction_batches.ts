import type { Knex } from 'knex';

/**
 * Groups bank transactions into import batches for fingerprint-based
 * deduplication and audit trail. One batch per import/sync per bank account.
 * Batches are immutable ingestion records; an incorrect import is reversed,
 * never deleted.
 */

const schemaName = 'app';
const tableName = 'bank_transaction_batches';
const BATCH_SOURCES = ['file_import', 'bank_feed', 'manual_entry'] as const;
const BATCH_STATUSES = ['active', 'reversed'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table.date('start_date').notNullable();
    table.date('end_date').notNullable();

    table
      .string('source', 32)
      .notNullable()
      .checkIn([...BATCH_SOURCES], 'bank_transaction_batches_source_chk');

    table.string('fingerprint', 256).notNullable();
    table.integer('import_row_count').notNullable();
    table
      .jsonb('source_metadata')
      .notNullable()
      .defaultTo(knex.raw(`'{}'::jsonb`));

    table
      .string('status', 16)
      .notNullable()
      .defaultTo('active')
      .checkIn([...BATCH_STATUSES], 'bank_transaction_batches_status_chk');

    table
      .uuid('bank_account_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.bank_accounts`)
      .onDelete('RESTRICT');

    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('RESTRICT');

    table
      .uuid('reversed_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('RESTRICT');

    table.timestamp('reversed_at', { useTz: true }).nullable();
    table.string('reversal_reason', 512).nullable();

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(
      ['bank_account_id', 'start_date', 'end_date'],
      'bank_transaction_batches_account_date_range_idx',
    );
    table.unique(
      ['bank_account_id', 'fingerprint'],
      { indexName: 'bank_transaction_batches_account_fingerprint_uniq' },
    );
  });

  await knex.raw(`
    COMMENT ON TABLE "${schemaName}"."${tableName}" IS
    'Import batches grouping bank transactions for fingerprint-based deduplication and audit trail.';
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
      ADD CONSTRAINT bank_transaction_batches_reversal_state_chk
        CHECK (
          (
            status = 'active'
            AND reversed_at IS NULL
            AND reversed_by_id IS NULL
            AND reversal_reason IS NULL
          )
          OR
          (
            status = 'reversed'
            AND reversed_at IS NOT NULL
            AND reversed_by_id IS NOT NULL
            AND reversal_reason IS NOT NULL
            AND reversal_reason = btrim(reversal_reason)
            AND char_length(reversal_reason) >= 1
          )
        ),
      ADD CONSTRAINT bank_transaction_batches_fingerprint_trimmed_chk
        CHECK (
          fingerprint = btrim(fingerprint)
          AND char_length(fingerprint) >= 1
        ),
      ADD CONSTRAINT bank_transaction_batches_date_range_chk
        CHECK (end_date >= start_date),
      ADD CONSTRAINT bank_transaction_batches_import_row_count_chk
        CHECK (import_row_count > 0);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
