import type { Knex } from 'knex';

import { preventUpdateOrDelete } from './utils/db.js';

/**
 * Close review decisions are the append-only record of user actions on close
 * findings (acknowledge, mark not applicable, dismiss). A finding is "open" when
 * a signal or period-level finding exists with no decision matching its current
 * facts_hash; an acknowledgement therefore survives re-evaluation while the
 * facts are unchanged and re-opens automatically when they change. This table is
 * the source of truth for lifecycle; close_review_signals never stores status.
 *
 * Because signals are hard-deleted as they reconcile, a decision must stay
 * meaningful after its signal is gone. So it carries a self-describing audit
 * snapshot (code, scope, ledger ids, facts_snapshot) rather than only opaque
 * hashes.
 */
const schemaName = 'app';
const tableName = 'close_review_decisions';
const qualifiedTable = `"${schemaName}"."${tableName}"`;

const DECISIONS = ['acknowledged', 'not_applicable', 'dismissed'] as const;
const FINDING_SCOPES = ['ledger_transaction_signal', 'period_finding'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('RESTRICT');

    table.integer('fiscal_year').notNullable();
    table.integer('period_number').notNullable();
    table
      .specificType('period_type', `"${schemaName}"."fiscal_period_type"`)
      .notNullable();

    // The signal or period-level finding this decision applies to.
    table.text('fingerprint').notNullable();
    table
      .text('facts_hash')
      .notNullable()
      .comment('Facts state at decision time; mismatch re-opens the finding');

    // Self-describing audit snapshot so the decision survives signal deletion.
    table
      .text('code')
      .notNullable()
      .comment('Finding code; spans signal codes and period-finding codes');
    table
      .string('finding_scope', 32)
      .notNullable()
      .checkIn([...FINDING_SCOPES], 'close_review_decisions_finding_scope_chk');
    table
      .uuid('ledger_transaction_id')
      .nullable()
      .comment(
        'Denormalized audit pointer; no FK so it survives reconciliation',
      );
    table.uuid('ledger_entry_id').nullable();
    table
      .jsonb('facts_snapshot')
      .notNullable()
      .defaultTo(knex.raw(`'{}'::jsonb`))
      .comment('Material facts captured at decision time, for post-hoc audit');

    table
      .string('decision', 32)
      .notNullable()
      .checkIn([...DECISIONS], 'close_review_decisions_decision_chk');
    // Every user override is explained — including dismiss.
    table.text('reason').notNullable();

    table
      .uuid('decided_by_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('RESTRICT');
    table
      .timestamp('decided_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // The period the finding belongs to. fiscal_calendar's natural key is the
    // period columns (no surrogate id), mirroring the gl_period_balances FK.
    table
      .foreign(
        ['company_id', 'fiscal_year', 'period_number', 'period_type'],
        'close_review_decisions_fiscal_calendar_fk',
      )
      .references(['company_id', 'fiscal_year', 'period_number', 'period_type'])
      .inTable(`${schemaName}.fiscal_calendar`)
      .onDelete('RESTRICT');
  });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedTable} IS
    'Append-only, self-describing user decisions (acknowledge / not applicable / dismiss) on close review findings, matched to signals by fingerprint and facts_hash.';
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedTable}
      ADD CONSTRAINT close_review_decisions_reason_required_chk
        CHECK (char_length(btrim(reason)) >= 1),
      ADD CONSTRAINT close_review_decisions_scope_shape_chk
        CHECK (
          (
            finding_scope = 'ledger_transaction_signal'
            AND ledger_transaction_id IS NOT NULL
          )
          OR
          (
            finding_scope = 'period_finding'
            AND ledger_transaction_id IS NULL
            AND ledger_entry_id IS NULL
          )
        ),
      ADD CONSTRAINT close_review_decisions_facts_snapshot_object_chk
        CHECK (jsonb_typeof(facts_snapshot) = 'object');
  `);

  await knex.raw(`
    CREATE INDEX close_review_decisions_period_fingerprint_idx
      ON ${qualifiedTable} (company_id, fiscal_year, period_number, fingerprint);

    CREATE INDEX close_review_decisions_current_match_idx
      ON ${qualifiedTable} (company_id, fingerprint, facts_hash, decided_at DESC);

    CREATE INDEX close_review_decisions_fingerprint_latest_idx
      ON ${qualifiedTable} (company_id, fingerprint, decided_at);
  `);

  await preventUpdateOrDelete(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  // The prevent_update_or_delete() function is shared across tables; drop only
  // this table's trigger and leave the function in place.
  await knex.raw(
    `DROP TRIGGER IF EXISTS prevent_update_or_delete_${tableName} ON ${qualifiedTable};`,
  );

  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
