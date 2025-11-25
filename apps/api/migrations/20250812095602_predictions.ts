import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.ts';

const tableName = 'predictions';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.uuid('bank_transaction_id').notNullable();
    table.date('bank_transaction_date').notNullable();
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('RESTRICT');
    table
      .uuid('coa_id')
      .notNullable()
      .references('id')
      .inTable('coa')
      .onDelete('RESTRICT');
    table.enu('method', ['rule', 'knn', 'human']).notNullable();
    table.decimal('confidence', 7, 6).notNullable(); // between 0 and 1
    table.jsonb('reason_json').notNullable().defaultTo('{}');
    table
      .uuid('created_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .uuid('updated_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    addStandardColumns(knex, table);

    table.index(['bank_transaction_id', 'company_id', 'coa_id']);
    table.index(['company_id', 'created_at']);
  });

  await knex.raw(`
    CREATE INDEX predictions_human_bank_tx_created_idx 
    ON predictions (bank_transaction_id, created_at DESC) 
    WHERE method = 'human';
  `);

  await knex.raw(`
    CREATE INDEX predictions_bank_tx_created_idx 
    ON predictions (bank_transaction_id, created_at DESC);
  `);

  // Add constraint to confidence manually, don't trust checkBetween
  await knex.raw(
    `ALTER TABLE predictions ADD CONSTRAINT predictions_confidence_check CHECK (confidence >= 0 AND confidence <= 1);`,
  );

  // Add composite foreign key to bank_transactions
  await knex.raw(`
    ALTER TABLE predictions 
    ADD CONSTRAINT predictions_bank_transaction_fk 
    FOREIGN KEY (bank_transaction_id, bank_transaction_date) 
    REFERENCES bank_transactions (id, date) 
    ON DELETE CASCADE;
  `);

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
