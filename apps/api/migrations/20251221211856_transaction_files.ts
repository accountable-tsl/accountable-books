import type { Knex } from 'knex';

const tableName = 'transaction_files';

// The idea is that transaction_id will be used for any kind of transaction whether ledger or journal or bank.. and if its an entry, entry_id will be added... that way we can determine if this is a bank transaction (source - bank and only transaction_id), ledger transaction (source - ledger and transaction_id only), ledger entry ( source-ledger and both transaction_id and entry_id), journal batch (source - journal and transaction_id only), journal entries (source-journal and both transaction_id and entry_id)
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table.string('name', 512).notNullable();
    table.string('key', 1024).notNullable().unique();
    table.string('bucket_name').notNullable();
    table.string('url').notNullable();
    table.string('type').notNullable();
    table.bigint('size_bytes').notNullable();
    table.string('checksum', 64);

    table
      .string('provider')
      .notNullable()
      .defaultTo('cloudflare_r2')
      .checkIn(['cloudflare_r2', 'aws_s3', 'google_gcs', 'backblaze_b2']);

    table.string('region').nullable();
    table.string('endpoint').nullable();

    table.string('source').checkIn(['ledger', 'journal', 'bank']).notNullable();
    table.uuid('transaction_id').nullable();
    table.uuid('entry_id').nullable();

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies') // For convenience
      .onDelete('RESTRICT');

    table
      .uuid('uploaded_by_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table
      .timestamp('uploaded_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.boolean('is_deleted').notNullable().defaultTo(false);
    table.timestamp('deleted_at', { useTz: true }).nullable();
    table
      .uuid('deleted_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
  });

  // One or both of transaction_id and entry_id must be set
  await knex.raw(`
  ALTER TABLE ${tableName}
  ADD CONSTRAINT at_least_one_of_transaction_or_entry_id
    CHECK (
      transaction_id IS NOT NULL
      AND (
        source IN ('bank', 'ledger', 'journal') AND
        (
          (source = 'bank' AND entry_id IS NULL) OR
          (source = 'ledger' AND entry_id IS NULL OR entry_id IS NOT NULL) OR
          (source = 'journal' AND entry_id IS NULL OR entry_id IS NOT NULL)
        )
      )
    )
`);

  // Indexes for performance (these fields will be used in WHERE clauses frequently)
  await knex.schema.table(tableName, (table) => {
    table.index(['transaction_id'], `${tableName}_transaction_id_idx`);
    table.index(['entry_id'], `${tableName}_entry_id_idx`);
    table.index(
      ['source', 'transaction_id'],
      `${tableName}_source_transaction_idx`,
    );
    table.index(
      ['company_id', 'is_deleted'],
      `${tableName}_company_deleted_idx`,
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable(tableName);
}
