import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';
import { createTrgmIndexes, dropTrgmIndexes } from './utils/trgmIndexes.js';

/**
 * Journal batches are the header records for manual double-entry journals.
 * Each batch owns a date, currency, lifecycle state, and links to the immutable
 * ledger transaction produced when it is posted. Drafts are editable and carry no
 * ledger impact; posting is irreversible and creates the ledger record. A posted
 * journal may be cancelled only by creating a reversing journal; the original is
 * then marked 'reversed'. Drafts that are abandoned are soft-deleted as 'voided'.
 * Recurring journals are identified by journal_source = 'generated_from_template'.
 */

const schemaName = 'app';
const tableName = 'journal_batches';
const qualifiedTable = `"${schemaName}"."${tableName}"`;

const STATUSES = ['draft', 'posted', 'voided', 'reversed'] as const;
const SOURCES = ['one_off', 'generated_from_template'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('RESTRICT');

    // --- Core journal fields ---
    table.date('date').notNullable();
    table.string('title', 512).notNullable();
    table.text('description').nullable();
    table.string('note', 2048).nullable();
    table.uuid('contact_id').nullable();

    // --- Currency ---
    table
      .uuid('currency_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.currencies`)
      .onDelete('RESTRICT');
    table.decimal('exchange_rate', 32, 10).notNullable().defaultTo(1.0);

    // --- Sequence & system reference (all null until posted) ---
    table.date('sequence_month').nullable();
    table.integer('sequence_number').nullable();
    table.string('system_reference', 64).nullable(); // system-generated on post: JE-YYYYMM-NNNN
    table.string('user_reference', 256).nullable(); // optional user/import-supplied reference

    // --- Status & source ---
    table
      .text('status')
      .notNullable()
      .defaultTo('draft')
      .checkIn([...STATUSES], 'journal_batches_status_chk');

    table
      .text('journal_source')
      .notNullable()
      .defaultTo('one_off')
      .checkIn([...SOURCES], 'journal_batches_source_chk');

    table.uuid('recurring_template_id').nullable(); // compound FK declared below

    // --- Ledger link (null until posted) ---
    table.uuid('ledger_transaction_id').nullable();

    // --- Reversal ---
    table.date('auto_reversal_date').nullable();
    table.uuid('reversal_journal_id').nullable(); // compound FK declared below
    table.uuid('original_journal_id').nullable(); // compound FK declared below
    table.timestamp('reversed_at', { useTz: true }).nullable();
    table
      .uuid('reversed_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('SET NULL');
    table.text('reversal_reason').nullable();

    // --- Metadata ---
    table.jsonb('metadata').notNullable().defaultTo(knex.raw("'{}'::jsonb"));

    // --- User audit ---
    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('RESTRICT');
    table
      .uuid('updated_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('SET NULL');
    table
      .uuid('deleted_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('SET NULL');

    addStandardColumns(knex, table);

    // --- Compound FKs ---
    table
      .foreign(
        ['contact_id', 'company_id'],
        'journal_batches_contact_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.contacts`)
      .onDelete('RESTRICT');

    table
      .foreign(
        ['recurring_template_id', 'company_id'],
        'journal_batches_template_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.recurring_journal_templates`)
      .onDelete('RESTRICT');

    table
      .foreign(
        ['ledger_transaction_id', 'company_id'],
        'journal_batches_ledger_transaction_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.ledger_transactions`)
      .onDelete('RESTRICT');

    // Scaffold for compound FKs from children (e.g. journal_entries)
    table.unique(['id', 'company_id']);

    table.index(
      ['status', 'company_id'],
      'journal_batch_status_company_id_idx',
    );
  });

  // Self-referential compound FKs are deferrable so related journals can be
  // created or torn down together inside one transaction.
  await knex.raw(`
    ALTER TABLE ${qualifiedTable}
      ADD CONSTRAINT journal_batches_reversal_company_fk
        FOREIGN KEY (reversal_journal_id, company_id)
        REFERENCES ${qualifiedTable} (id, company_id)
        ON DELETE NO ACTION
        DEFERRABLE INITIALLY DEFERRED,
      ADD CONSTRAINT journal_batches_original_company_fk
        FOREIGN KEY (original_journal_id, company_id)
        REFERENCES ${qualifiedTable} (id, company_id)
        ON DELETE NO ACTION
        DEFERRABLE INITIALLY DEFERRED;
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);

  await knex.schema.withSchema(schemaName).alterTable(tableName, (table) => {
    table.index(
      ['company_id', 'date'],
      'journal_batch_company_date_desc_idx',
    );
    table.index(
      ['company_id', 'status', 'date'],
      'journal_batch_company_status_date_desc_idx',
    );
  });

  // Partial index for the auto-reversal background job
  await knex.raw(`
    CREATE INDEX journal_batch_auto_reversal_idx
      ON ${qualifiedTable} (company_id, auto_reversal_date)
      WHERE auto_reversal_date IS NOT NULL
        AND status = 'posted'
        AND reversed_at IS NULL
        AND reversal_journal_id IS NULL
        AND is_deleted = false;
  `);

  // Unique posted sequence per company per month
  await knex.raw(`
    CREATE UNIQUE INDEX journal_batch_company_month_seq_unique
      ON ${qualifiedTable} (company_id, sequence_month, sequence_number)
      WHERE sequence_month IS NOT NULL
        AND is_deleted = false;
  `);

  // Unique system reference per company
  await knex.raw(`
    CREATE UNIQUE INDEX journal_batch_company_system_reference_unique
      ON ${qualifiedTable} (company_id, system_reference)
      WHERE system_reference IS NOT NULL
        AND is_deleted = false;
  `);

  // Unique user-supplied reference per company
  await knex.raw(`
    CREATE UNIQUE INDEX journal_batch_company_user_reference_unique
      ON ${qualifiedTable} (company_id, user_reference)
      WHERE user_reference IS NOT NULL
        AND is_deleted = false;
  `);

  // One generated journal per template per accounting date (idempotency guard)
  await knex.raw(`
    CREATE UNIQUE INDEX journal_batch_recurring_idempotency_idx
      ON ${qualifiedTable} (recurring_template_id, date)
      WHERE recurring_template_id IS NOT NULL
        AND is_deleted = false;
  `);

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedTable} IS
      'Manual double-entry journal headers. Owns draft editing, posting state, recurrence origin, reversal relationships, and the link to the immutable ledger transaction.';
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedTable}
      -- Sequence month must always be the first of the month
      ADD CONSTRAINT journal_batches_sequence_month_first_day_chk
        CHECK (
          sequence_month IS NULL
          OR sequence_month = date_trunc('month', sequence_month)::date
        ),

      -- Sequence number must be a positive integer when set
      ADD CONSTRAINT journal_batches_sequence_number_positive_chk
        CHECK (sequence_number IS NULL OR sequence_number >= 1),

      -- journal_source and recurring_template_id must agree
      ADD CONSTRAINT journal_batches_source_template_chk
        CHECK (
          (journal_source = 'generated_from_template' AND recurring_template_id IS NOT NULL)
          OR (journal_source = 'one_off' AND recurring_template_id IS NULL)
        ),

      -- exchange_rate must be positive
      ADD CONSTRAINT journal_batches_exchange_rate_positive_chk
        CHECK (exchange_rate > 0),

      -- Soft-delete fields must be consistent
      ADD CONSTRAINT journal_batches_soft_delete_chk
        CHECK (
          (is_deleted = false AND deleted_at IS NULL)
          OR (is_deleted = true AND deleted_at IS NOT NULL)
        ),

      -- Soft deletion is only used to preserve cancelled drafts in journal history
      ADD CONSTRAINT journal_batches_deleted_status_chk
        CHECK (is_deleted = false OR status = 'voided'),

      -- Voided journals are always soft-deleted
      ADD CONSTRAINT journal_batches_voided_deleted_chk
        CHECK (
          status != 'voided'
          OR (
            is_deleted = true
            AND deleted_at IS NOT NULL
            AND deleted_by_id IS NOT NULL
          )
        ),

      -- Reversed journals are never soft-deleted
      ADD CONSTRAINT journal_batches_reversed_not_deleted_chk
        CHECK (status != 'reversed' OR is_deleted = false),

      -- Reversal fields are all-or-nothing and tied exclusively to the reversed status
      ADD CONSTRAINT journal_batches_reversal_fields_chk
        CHECK (
          (
            status = 'reversed'
            AND reversed_at IS NOT NULL
            AND reversed_by_id IS NOT NULL
            AND reversal_journal_id IS NOT NULL
          ) OR (
            status != 'reversed'
            AND reversed_at IS NULL
            AND reversed_by_id IS NULL
            AND reversal_journal_id IS NULL
            AND reversal_reason IS NULL
          )
        ),

      -- Self references would make reversal/origin relationships meaningless
      ADD CONSTRAINT journal_batches_self_reference_chk
        CHECK (
          (reversal_journal_id IS NULL OR reversal_journal_id <> id)
          AND (original_journal_id IS NULL OR original_journal_id <> id)
        ),

      -- Sequence and system reference are null on draft/voided, required on posted/reversed
      ADD CONSTRAINT journal_batches_status_sequence_chk
        CHECK (
          (
            status IN ('draft', 'voided')
            AND system_reference IS NULL
            AND sequence_month IS NULL
            AND sequence_number IS NULL
          ) OR (
            status IN ('posted', 'reversed')
            AND system_reference IS NOT NULL
            AND sequence_month IS NOT NULL
            AND sequence_number IS NOT NULL
          )
        ),

      -- Text fields must be trimmed and non-empty when present
      ADD CONSTRAINT journal_batches_text_trimmed_chk
        CHECK (
          title = btrim(title) AND char_length(title) >= 1
          AND (system_reference IS NULL OR (system_reference = btrim(system_reference) AND char_length(system_reference) >= 1))
          AND (user_reference IS NULL OR (user_reference = btrim(user_reference) AND char_length(user_reference) >= 1))
          AND (description IS NULL OR (description = btrim(description) AND char_length(description) >= 1))
          AND (note IS NULL OR (note = btrim(note) AND char_length(note) >= 1))
          AND (reversal_reason IS NULL OR (reversal_reason = btrim(reversal_reason) AND char_length(reversal_reason) >= 1))
        );
  `);

  // Deferrable commit-time lifecycle guard. PostgreSQL CHECK constraints cannot
  // be deferrable, so a constraint trigger enforces the ledger/status invariant
  // after all rows in the surrounding transaction have reached their final state.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION "${schemaName}".enforce_journal_batch_lifecycle()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.status IN ('draft', 'voided')
        AND NEW.ledger_transaction_id IS NOT NULL
      THEN
        RAISE EXCEPTION 'Draft and voided journal batches cannot have ledger transactions';
      END IF;

      IF NEW.status IN ('posted', 'reversed')
        AND NEW.ledger_transaction_id IS NULL
      THEN
        RAISE EXCEPTION 'Posted and reversed journal batches must have ledger transactions';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE CONSTRAINT TRIGGER journal_batches_lifecycle_guard
      AFTER INSERT OR UPDATE ON ${qualifiedTable}
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION "${schemaName}".enforce_journal_batch_lifecycle();
  `);

  await createTrgmIndexes(
    knex,
    tableName,
    ['system_reference', 'user_reference', 'title', 'description', 'note'],
    'search_text',
    schemaName,
  );
}

export async function down(knex: Knex): Promise<void> {
  await dropTrgmIndexes(knex, tableName, 'search_text', schemaName);
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
  await knex.raw(
    `DROP FUNCTION IF EXISTS "${schemaName}".enforce_journal_batch_lifecycle()`,
  );
}
