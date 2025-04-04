import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    `CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended')`
  );

  await knex.raw(`
    CREATE TYPE fs_key AS ENUM ('balance_sheet', 'income_statement');
  `);

  await knex.raw(`
    CREATE TYPE debit_credit AS ENUM ('debit', 'credit');
  `);

  await knex.raw(`
    CREATE TYPE bank_transaction_source AS ENUM ('file_import', 'bank_feed', 'manual_entry');
  `);

  await knex.raw(`
    CREATE TYPE bank_account_type AS ENUM ('other', 'credit_card', 'debit_card', 'savings', 'checkings_current', 'utility');
  `);

  await knex.raw(`
    CREATE TYPE categorization_status AS ENUM ('uncategorized', 'categorized', 'auto_categorized');
  `);

  await knex.raw(`
    CREATE TYPE transaction_source AS ENUM ('bank', 'manual_journal', 'system');
  `);

  await knex.raw(`
    CREATE TYPE journal_status AS ENUM ('draft', 'posted', 'voided');
  `);

  await knex.raw(`
    CREATE TYPE journal_reversal_reason AS ENUM ('auto_reversal', 'voided');
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TYPE IF EXISTS user_status`);
  await knex.raw(`DROP TYPE IF EXISTS fs_key`);
  await knex.raw(`DROP TYPE IF EXISTS debit_credit`);
  await knex.raw(`DROP TYPE IF EXISTS bank_transaction_source`);
  await knex.raw(`DROP TYPE IF EXISTS bank_account_type`);
  await knex.raw(`DROP TYPE IF EXISTS categorization_status`);
  await knex.raw(`DROP TYPE IF EXISTS transaction_source`);
  await knex.raw(`DROP TYPE IF EXISTS journal_status`);
  await knex.raw(`DROP TYPE IF EXISTS journal_reversal_reason`);
}
