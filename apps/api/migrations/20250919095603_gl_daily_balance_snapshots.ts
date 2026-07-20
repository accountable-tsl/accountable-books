import type { Knex } from 'knex';

/**
 * GL daily balance snapshots are derived per-account daily roll-forward rows.
 * They store each company's opening balance, same-day debit/credit movement,
 * and closing balance for a COA on a calendar day. Posted ledger entries remain
 * the source of truth; these rows make point-in-time balances, ledger explorer
 * opening anchors, and period balance materialization fast.
 */
const schemaName = 'app';
const tableName = 'gl_daily_balance_snapshots';
const qualifiedTable = `"${schemaName}"."${tableName}"`;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('RESTRICT');

    table.uuid('coa_id').notNullable();

    table.date('day').notNullable();

    table.decimal('opening_balance', 18, 3).notNullable().defaultTo(0);
    table.decimal('day_debits', 18, 3).notNullable().defaultTo(0);
    table.decimal('day_credits', 18, 3).notNullable().defaultTo(0);
    table.decimal('closing_balance', 18, 3).notNullable().defaultTo(0);

    table.integer('transaction_count').notNullable().defaultTo(0);

    table
      .timestamp('calculated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.primary(['company_id', 'coa_id', 'day']);

    table
      .foreign(
        ['coa_id', 'company_id'],
        'gl_daily_balance_snapshots_coa_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.coa`)
      .onDelete('RESTRICT');
  });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedTable} IS
    'Derived daily opening, movement, and closing reporting-currency balances per company COA, rebuilt from posted ledger entries.';
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedTable}
      ADD CONSTRAINT gl_daily_balance_math_chk
        CHECK (closing_balance = opening_balance + day_debits - day_credits),
      ADD CONSTRAINT gl_daily_balance_nonnegative_activity_chk
        CHECK (
          day_debits >= 0
          AND day_credits >= 0
          AND transaction_count >= 0
        ),
      ADD CONSTRAINT gl_daily_balance_day_chk
        CHECK (day >= DATE '1900-01-01');
  `);

  await knex.raw(`
    CREATE INDEX gl_daily_snapshots_company_day_idx
      ON ${qualifiedTable} (company_id, day DESC);

    CREATE INDEX gl_daily_snapshots_company_coa_day_desc_idx
      ON ${qualifiedTable} (company_id, coa_id, day DESC)
      INCLUDE (
        opening_balance,
        day_debits,
        day_credits,
        closing_balance,
        transaction_count,
        calculated_at
      );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `DROP INDEX IF EXISTS "${schemaName}".gl_daily_snapshots_company_coa_day_desc_idx;`,
  );
  await knex.raw(
    `DROP INDEX IF EXISTS "${schemaName}".gl_daily_snapshots_company_day_idx;`,
  );

  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
