import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Close review signals are durable, stateless accounting-judgment facts about a
 * single posted ledger transaction (e.g. an accrual bank receipt posted directly
 * to revenue). They are generated after a ledger write and reconciled by
 * upsert/hard-delete as the transaction changes, so there are no soft-delete
 * columns. Lifecycle (acknowledged/resolved) is NOT stored here — it is derived
 * from close_review_decisions matched by fingerprint and facts_hash.
 *
 * Model boundary (intentional for V1): this is a CURRENT-FACT table plus an
 * append-only decisions log — not a full event-sourced signal lifecycle. There
 * is no signal_events table and no materialized lifecycle projection; "open" vs
 * "acknowledged" is derived at read time from signals minus matching decisions.
 */
const schemaName = 'app';
const tableName = 'close_review_signals';
const qualifiedTable = `"${schemaName}"."${tableName}"`;

// Snapshot of CLOSE_REVIEW_SIGNAL_CODES at this migration. Migrations are
// point-in-time and must not import app code; the application enum is the
// source of truth and a later migration extends this as the catalog grows.
const SIGNAL_CODES = [
  'bank_offset_to_non_cash_account',
  'bank_offset_direct_to_revenue',
  'bank_offset_direct_to_expense',
  'bank_offset_to_capex',
  'posted_to_fallback_account',
  'monetary_fx_leg',
  'posting_missing_required_contact',
  'posting_missing_supporting_doc',
  'journal_to_bank_account',
  'journal_depreciation_pairing_mismatch',
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('RESTRICT');

    table.uuid('ledger_transaction_id').notNullable();

    table
      .uuid('ledger_entry_id')
      .nullable()
      .comment('Offending non-bank leg when the signal is leg-specific');

    // Period the signal belongs to, derived from the entry's fs_date.
    table.integer('fiscal_year').notNullable();
    table.integer('period_number').notNullable();
    table
      .specificType('period_type', `"${schemaName}"."fiscal_period_type"`)
      .notNullable();

    table
      .string('code', 64)
      .notNullable()
      .checkIn([...SIGNAL_CODES], 'close_review_signals_code_chk');

    table
      .uuid('coa_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.coa`)
      .onDelete('SET NULL');
    table.text('account_type_key').nullable();
    table.text('account_element_key').nullable();
    table.decimal('amount', 18, 3).nullable();

    // Stable identity; facts_hash captures the material facts so a decision can
    // be invalidated when they change.
    table.text('fingerprint').notNullable();
    table.text('facts_hash').notNullable();

    table.jsonb('details').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
    table
      .timestamp('detected_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(['fingerprint'], {
      indexName: 'close_review_signals_fingerprint_unique',
    });

    // Derived facts of a ledger transaction: cascade when that tenant-scoped
    // transaction is removed.
    table
      .foreign(
        ['ledger_transaction_id', 'company_id'],
        'close_review_signals_ledger_transaction_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.ledger_transactions`)
      .onDelete('CASCADE');

    // Offending leg, when leg-specific. Nullable, so MATCH SIMPLE skips the FK
    // for transaction-level signals.
    table
      .foreign(
        ['ledger_entry_id', 'company_id'],
        'close_review_signals_ledger_entry_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.ledger_entries`)
      .onDelete('CASCADE');

    // The period the signal belongs to. fiscal_calendar has no surrogate key —
    // its natural key is the period columns — so this mirrors the
    // gl_period_balances FK rather than pointing at a single id.
    table
      .foreign(
        ['company_id', 'fiscal_year', 'period_number', 'period_type'],
        'close_review_signals_fiscal_calendar_fk',
      )
      .references(['company_id', 'fiscal_year', 'period_number', 'period_type'])
      .inTable(`${schemaName}.fiscal_calendar`)
      .onDelete('RESTRICT');
  });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedTable} IS
    'Stateless per-transaction close review signals, reconciled after ledger writes and summarized at close.';
  `);

  await knex.raw(`
    CREATE INDEX close_review_signals_period_code_idx
      ON ${qualifiedTable} (company_id, fiscal_year, period_number, code);

    CREATE INDEX close_review_signals_ledger_transaction_idx
      ON ${qualifiedTable} (ledger_transaction_id);
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
