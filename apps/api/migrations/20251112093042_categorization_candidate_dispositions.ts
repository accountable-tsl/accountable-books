import type { Knex } from 'knex';

const schemaName = 'app';
const CANDIDATES_TABLE = 'categorization_candidates';
const CANDIDATE_DISPOSITIONS_TABLE = 'categorization_candidate_dispositions';

const CANDIDATE_DISPOSITIONS = [
  'created',
  'ignored',
  'replaced',
  'rejected',
  'posted',
  'expired_source_posted',
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
    .createTable(CANDIDATE_DISPOSITIONS_TABLE, (table) => {
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
        .string('disposition', 32)
        .notNullable()
        .checkIn(
          [...CANDIDATE_DISPOSITIONS],
          'cat_candidate_dispositions_type_chk',
        );
      table
        .uuid('actor_user_id')
        .nullable()
        .references('id')
        .inTable(schemaTable('users'));
      table.uuid('run_id').nullable();
      table
        .uuid('related_candidate_id')
        .nullable()
        .references('id')
        .inTable(schemaTable(CANDIDATES_TABLE))
        .onDelete('SET NULL');
      table
        .uuid('ledger_transaction_id')
        .nullable()
        .references('id')
        .inTable(schemaTable('ledger_transactions'))
        .onDelete('SET NULL');
      table.text('reason').nullable();
      table.jsonb('metadata').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
      table.text('idempotency_key').notNullable();
      table
        .timestamp('created_at', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
    });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedTable(CANDIDATE_DISPOSITIONS_TABLE)} IS
    'Append-only lifecycle history for categorization candidates.';
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX idx_cat_candidate_dispositions_idempotency
      ON ${qualifiedTable(CANDIDATE_DISPOSITIONS_TABLE)} (idempotency_key);

    CREATE INDEX idx_cat_candidate_dispositions_candidate
      ON ${qualifiedTable(CANDIDATE_DISPOSITIONS_TABLE)} (candidate_id, created_at DESC);

    CREATE INDEX idx_cat_candidate_dispositions_bank_tx
      ON ${qualifiedTable(CANDIDATE_DISPOSITIONS_TABLE)} (bank_transaction_id, created_at DESC);
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION "${schemaName}".prevent_candidate_dispositions_update_delete()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'categorization_candidate_dispositions is append-only';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER categorization_candidate_dispositions_no_update_delete
    BEFORE UPDATE OR DELETE ON ${qualifiedTable(CANDIDATE_DISPOSITIONS_TABLE)}
    FOR EACH ROW
    EXECUTE FUNCTION "${schemaName}".prevent_candidate_dispositions_update_delete();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TRIGGER IF EXISTS categorization_candidate_dispositions_no_update_delete
      ON ${qualifiedTable(CANDIDATE_DISPOSITIONS_TABLE)};
    DROP FUNCTION IF EXISTS "${schemaName}".prevent_candidate_dispositions_update_delete();
    DROP INDEX IF EXISTS "${schemaName}".idx_cat_candidate_dispositions_bank_tx;
    DROP INDEX IF EXISTS "${schemaName}".idx_cat_candidate_dispositions_candidate;
    DROP INDEX IF EXISTS "${schemaName}".idx_cat_candidate_dispositions_idempotency;
  `);
  await knex.schema
    .withSchema(schemaName)
    .dropTableIfExists(CANDIDATE_DISPOSITIONS_TABLE);
}
