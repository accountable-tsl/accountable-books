import type { Knex } from 'knex';

const tableName = 'bank_account_current_native_balances';

/**
 * Per-account balance facts. Two independent values share one row:
 * - native_balance / as_of_time: computed cache owned by balance recalc
 * - provider_reported_balance / provider_reported_at: bank truth from connect/sync
 *   (derivation anchor). Never overwrite provider columns from recalc.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');

    table
      .uuid('bank_account_id')
      .notNullable()
      .references('id')
      .inTable('bank_accounts')
      .onDelete('CASCADE');

    table.timestamp('as_of_time', { useTz: true }).nullable();

    // Recalc-owned computed cache; null until the first successful recalc.
    table.decimal('native_balance', 18, 3).nullable();

    // Provider-reported statement balance; written only from connect/sync.
    table.decimal('provider_reported_balance', 18, 3).nullable();
    table.timestamp('provider_reported_at', { useTz: true }).nullable();

    table.primary(['company_id', 'bank_account_id']);
  });

  await knex.raw(`
    CREATE INDEX bank_account_current_balances_company_idx
      ON bank_account_current_native_balances (company_id);
  `);

  await knex.raw(`
    ALTER TABLE bank_account_current_native_balances
      ADD CONSTRAINT bank_account_current_native_balances_native_pair_chk
        CHECK (
          (native_balance IS NULL AND as_of_time IS NULL)
          OR (native_balance IS NOT NULL AND as_of_time IS NOT NULL)
        ),
      ADD CONSTRAINT bank_account_current_native_balances_provider_pair_chk
        CHECK (
          (provider_reported_balance IS NULL AND provider_reported_at IS NULL)
          OR (provider_reported_balance IS NOT NULL AND provider_reported_at IS NOT NULL)
        );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `DROP INDEX IF EXISTS bank_account_current_balances_company_idx;`,
  );
  await knex.schema.dropTableIfExists(tableName);
}
