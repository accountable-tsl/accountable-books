import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Journal entries are the ordered debit and credit lines for a journal batch.
 * Active draft lines are editable intent. When a journal is posted, active
 * lines are linked one-to-one to immutable ledger entries. Draft edits retain
 * replaced lines as superseded history, and voided drafts retain their final
 * line set as voided lines for UI/audit visibility.
 */

const schemaName = 'app';
const tableName = 'journal_entries';
const qualifiedTable = `"${schemaName}"."${tableName}"`;
const ENTRY_STATUSES = ['active', 'superseded', 'voided'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table.uuid('company_id').notNullable();
    table.uuid('journal_batch_id').notNullable();
    table.integer('line_number').notNullable();

    table.string('description', 512).nullable();
    table.specificType('side', `"${schemaName}"."debit_credit"`).notNullable();
    table.decimal('amount', 18, 3).notNullable();

    table.uuid('coa_id').notNullable();
    table.uuid('project_id').nullable();
    table.uuid('ledger_entry_id').nullable();

    table
      .text('entry_status')
      .notNullable()
      .defaultTo('active')
      .checkIn([...ENTRY_STATUSES], 'journal_entries_status_chk');

    addStandardColumns(knex, table);

    table
      .foreign(['journal_batch_id', 'company_id'], 'journal_entries_batch_fk')
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.journal_batches`)
      .onDelete('RESTRICT');

    table
      .foreign(['coa_id', 'company_id'], 'journal_entries_coa_fk')
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.coa`)
      .onDelete('RESTRICT');

    table
      .foreign(['project_id', 'company_id'], 'journal_entries_project_fk')
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.projects`)
      .onDelete('RESTRICT');

    table
      .foreign(['ledger_entry_id', 'company_id'], 'journal_entries_ledger_fk')
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.ledger_entries`)
      .onDelete('RESTRICT');

    table.index(
      ['company_id', 'journal_batch_id', 'entry_status', 'line_number'],
      'journal_entries_batch_status_line_idx',
    );
    table.index(['company_id', 'coa_id'], 'journal_entries_company_coa_idx');
    table.index(
      ['company_id', 'project_id'],
      'journal_entries_company_project_idx',
    );
    table.index(
      ['company_id', 'ledger_entry_id'],
      'journal_entries_company_ledger_idx',
    );
  });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedTable} IS
      'Ordered debit and credit lines for journal batches. Active lines represent the current journal, superseded lines preserve draft edit history, and voided lines preserve cancelled draft visibility.';

    ALTER TABLE ${qualifiedTable}
      ADD CONSTRAINT journal_entries_positive_amount_chk
        CHECK (amount > 0),
      ADD CONSTRAINT journal_entries_line_number_positive_chk
        CHECK (line_number > 0),
      ADD CONSTRAINT journal_entries_description_trimmed_chk
        CHECK (
          description IS NULL
          OR (description = btrim(description) AND char_length(description) >= 1)
        ),
      ADD CONSTRAINT journal_entries_deleted_state_chk
        CHECK (
          (
            entry_status = 'active'
            AND is_deleted = false
            AND deleted_at IS NULL
          ) OR (
            entry_status IN ('superseded', 'voided')
            AND is_deleted = true
            AND deleted_at IS NOT NULL
          )
        );
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX journal_entries_active_line_unique
      ON ${qualifiedTable} (company_id, journal_batch_id, line_number)
      WHERE entry_status = 'active'
        AND is_deleted = false;

    CREATE UNIQUE INDEX journal_entries_ledger_link_unique
      ON ${qualifiedTable} (company_id, ledger_entry_id)
      WHERE ledger_entry_id IS NOT NULL;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION "${schemaName}".validate_journal_entries_for_batch(
      target_journal_batch_id uuid,
      target_company_id uuid,
      target_batch_status text
    )
    RETURNS void AS $$
    DECLARE
      active_count integer;
      active_debits numeric;
      active_credits numeric;
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM "${schemaName}".journal_entries je
        WHERE je.company_id = target_company_id
          AND je.journal_batch_id = target_journal_batch_id
          AND je.entry_status IN ('superseded', 'voided')
          AND je.ledger_entry_id IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'Superseded and voided journal entries cannot have ledger links';
      END IF;

      IF target_batch_status = 'draft' AND EXISTS (
        SELECT 1
        FROM "${schemaName}".journal_entries je
        WHERE je.company_id = target_company_id
          AND je.journal_batch_id = target_journal_batch_id
          AND je.entry_status = 'active'
          AND je.ledger_entry_id IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'Active draft journal entries cannot have ledger links';
      END IF;

      IF target_batch_status IN ('posted', 'reversed') AND EXISTS (
        SELECT 1
        FROM "${schemaName}".journal_entries je
        WHERE je.company_id = target_company_id
          AND je.journal_batch_id = target_journal_batch_id
          AND je.entry_status = 'active'
          AND je.ledger_entry_id IS NULL
      ) THEN
        RAISE EXCEPTION 'Active posted and reversed journal entries must have ledger links';
      END IF;

      IF target_batch_status = 'voided' THEN
        IF EXISTS (
          SELECT 1
          FROM "${schemaName}".journal_entries je
          WHERE je.company_id = target_company_id
            AND je.journal_batch_id = target_journal_batch_id
            AND je.entry_status = 'active'
            AND je.is_deleted = false
        ) THEN
          RAISE EXCEPTION 'Voided journal batches cannot have active entries';
        END IF;

        RETURN;
      END IF;

      SELECT
        COUNT(*)::integer,
        COALESCE(SUM(amount) FILTER (WHERE side = 'debit'), 0),
        COALESCE(SUM(amount) FILTER (WHERE side = 'credit'), 0)
      INTO active_count, active_debits, active_credits
      FROM "${schemaName}".journal_entries je
      WHERE je.company_id = target_company_id
        AND je.journal_batch_id = target_journal_batch_id
        AND je.entry_status = 'active'
        AND je.is_deleted = false;

      IF active_count < 2 THEN
        RAISE EXCEPTION 'Non-voided journal batches must have at least two active entries';
      END IF;

      IF active_debits <> active_credits THEN
        RAISE EXCEPTION 'Active journal entries must balance';
      END IF;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION "${schemaName}".enforce_journal_entries_lifecycle()
    RETURNS TRIGGER AS $$
    DECLARE
      batch_status text;
    BEGIN
      SELECT status
      INTO batch_status
      FROM "${schemaName}".journal_batches
      WHERE id = NEW.journal_batch_id
        AND company_id = NEW.company_id;

      IF batch_status IS NULL THEN
        RAISE EXCEPTION 'Journal entry must reference an existing journal batch in the same company';
      END IF;

      PERFORM "${schemaName}".validate_journal_entries_for_batch(
        NEW.journal_batch_id,
        NEW.company_id,
        batch_status
      );

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE CONSTRAINT TRIGGER journal_entries_lifecycle_guard
      AFTER INSERT OR UPDATE ON ${qualifiedTable}
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION "${schemaName}".enforce_journal_entries_lifecycle();

    CREATE OR REPLACE FUNCTION "${schemaName}".enforce_journal_entries_lifecycle_for_batch()
    RETURNS TRIGGER AS $$
    BEGIN
      PERFORM "${schemaName}".validate_journal_entries_for_batch(
        NEW.id,
        NEW.company_id,
        NEW.status
      );

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE CONSTRAINT TRIGGER journal_entries_batch_lifecycle_guard
      AFTER INSERT OR UPDATE OF status ON "${schemaName}".journal_batches
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION "${schemaName}".enforce_journal_entries_lifecycle_for_batch();
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `DROP TRIGGER IF EXISTS journal_entries_batch_lifecycle_guard ON "${schemaName}".journal_batches`,
  );
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
  await knex.raw(
    `DROP FUNCTION IF EXISTS "${schemaName}".enforce_journal_entries_lifecycle()`,
  );
  await knex.raw(
    `DROP FUNCTION IF EXISTS "${schemaName}".enforce_journal_entries_lifecycle_for_batch()`,
  );
  await knex.raw(
    `DROP FUNCTION IF EXISTS "${schemaName}".validate_journal_entries_for_batch(uuid, uuid, text)`,
  );
}
