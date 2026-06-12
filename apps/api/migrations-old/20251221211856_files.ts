import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const tableName = 'files';

/**
 * Creates the `files` table - one row per actual uploaded blob.
 * This is the normalized design where file metadata lives in one place,
 * and attachments to transactions are handled via `file_attachments`.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    // File identity
    table.string('name', 512).notNullable().comment('Original filename');
    table
      .string('key', 1024)
      .notNullable()
      .comment('Storage key/path (e.g., {company_id}/txn/abc123.pdf)');
    table.string('bucket_name').notNullable();
    table.string('url').notNullable().comment('Public or signed URL');
    table.string('mime_type', 255).notNullable().comment('MIME type');
    table.bigint('size_bytes').notNullable();
    table.string('checksum', 128).nullable().comment('MD5/SHA256 checksum');

    // Storage provider info
    table
      .string('provider')
      .notNullable()
      .checkIn(['cloudflare_r2', 'aws_s3', 'google_gcs', 'backblaze_b2']);
    table.string('region').nullable();
    table.string('endpoint').nullable();

    // Ownership
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
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

    // Standard columns (created_at, updated_at, is_deleted, deleted_at)
    addStandardColumns(knex, table);

    table
      .uuid('deleted_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
  });

  // Unique constraint: one blob per key per company
  await knex.schema.table(tableName, (table) => {
    table.unique(['company_id', 'key'], {
      indexName: 'files_company_key_unique',
    });
  });

  // Indexes
  await knex.schema.table(tableName, (table) => {
    table.index(['company_id', 'is_deleted'], 'files_company_deleted_idx');
    table.index(['uploaded_by_id'], 'files_uploaded_by_idx');
    table.index(['uploaded_at'], 'files_uploaded_at_idx');
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
