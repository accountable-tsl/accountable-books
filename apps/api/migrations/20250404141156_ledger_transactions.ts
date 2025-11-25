import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.ts';
import { createTrgmIndexes, dropTrgmIndexes } from './utils/trgmIndexes.ts';

const tableName = 'ledger_transactions';
const uniqueBankTxnIndex = 'ux_ledger_transactions_bank_txn_date_id_not_null';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.timestamp('date', { useTz: true }).notNullable();
    table.specificType('source', 'transaction_source').notNullable();
    table.string('description', 512).nullable();
    table.string('reference').nullable();
    table.string('note').nullable();

    table.uuid('contact_id').nullable().references('id').inTable('contacts');
    table.specificType('contact_type_snapshot', 'contact_type').nullable();

    table.uuid('bank_transaction_id').nullable();
    table.date('bank_transaction_date').nullable();

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies');
    table.uuid('created_by_id').notNullable().references('id').inTable('users');
    table.uuid('updated_by_id').nullable().references('id').inTable('users');

    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, tableName);
  await createTrgmIndexes(knex, tableName, [
    'description',
    'reference',
    'note',
  ]);

  // Ensure one-to-one linkage to bank transactions when provided
  await knex.raw(
    `CREATE UNIQUE INDEX ${uniqueBankTxnIndex} ON ${tableName} (company_id, bank_transaction_date, bank_transaction_id)
     WHERE bank_transaction_id IS NOT NULL AND bank_transaction_date IS NOT NULL AND is_deleted = false`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await dropTrgmIndexes(knex, tableName);
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.raw(`DROP INDEX IF EXISTS ${uniqueBankTxnIndex}`);
  await knex.schema.dropTableIfExists(tableName);
}
