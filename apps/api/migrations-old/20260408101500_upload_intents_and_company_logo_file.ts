import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const uploadIntentsTable = 'upload_intents';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('companies', (table) => {
    table
      .uuid('logo_file_id')
      .nullable()
      .references('id')
      .inTable('files')
      .onDelete('SET NULL');

    table.index(['logo_file_id'], 'companies_logo_file_id_idx');
  });

  await knex.schema.createTable(uploadIntentsTable, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');

    table
      .uuid('requested_by_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table
      .string('purpose', 64)
      .notNullable()
      .checkIn(['company_logo', 'txn_attachment']);

    table.string('bucket_name', 255).notNullable();
    table.string('file_key', 1024).notNullable();
    table.string('original_filename', 512).notNullable();
    table.string('content_type', 255).notNullable();
    table.bigint('size_bytes').notNullable();
    table
      .string('status', 32)
      .notNullable()
      .defaultTo('pending')
      .checkIn(['pending', 'finalized', 'cancelled', 'expired']);

    table.jsonb('metadata').nullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('finalized_at', { useTz: true }).nullable();
    table.timestamp('consumed_at', { useTz: true }).nullable();
    table.timestamp('cancelled_at', { useTz: true }).nullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(['file_key'], {
      indexName: 'upload_intents_file_key_unique',
    });

    table.index(
      ['company_id', 'purpose'],
      'upload_intents_company_purpose_idx',
    );
    table.index(['requested_by_id'], 'upload_intents_requested_by_idx');
    table.index(['status', 'expires_at'], 'upload_intents_status_expires_idx');
  });

  await createUpdateTimestampTrigger(knex, uploadIntentsTable);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, uploadIntentsTable);
  await knex.schema.dropTableIfExists(uploadIntentsTable);

  await knex.schema.alterTable('companies', (table) => {
    table.dropIndex(['logo_file_id'], 'companies_logo_file_id_idx');
    table.dropColumn('logo_file_id');
  });
}
