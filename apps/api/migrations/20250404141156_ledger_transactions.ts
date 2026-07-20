import type { Knex } from 'knex';

/**
 * Ledger transactions are immutable posting headers. Each row groups the
 * ledger entries produced by one posted source event and owns that posting
 * version's lifecycle.
 */

const schemaName = 'app';
const tableName = 'ledger_transactions';
const qualifiedTable = `"${schemaName}"."${tableName}"`;
const TRANSACTION_SOURCES = ['manual_journal', 'bank_transaction'] as const;
const LEDGER_TRANSACTION_STATUSES = ['posted', 'superseded'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('RESTRICT');

    table.date('transaction_date').notNullable();

    table
      .string('transaction_source', 32)
      .notNullable()
      .checkIn([...TRANSACTION_SOURCES], 'ledger_transactions_source_check');

    table
      .specificType(
        'categorization_source',
        `"${schemaName}"."txn_categorization_source"`,
      )
      .notNullable();

    table.string('description', 512).nullable();
    table.string('reference', 256).nullable();
    table.string('note', 2048).nullable();

    table.uuid('contact_id').nullable();
    table
      .specificType('contact_type', `"${schemaName}"."contact_type"`)
      .nullable();

    table.uuid('source_transaction_id').notNullable();
    table.date('source_transaction_date').nullable();
    table.decimal('source_transaction_amount', 18, 4).nullable();
    table
      .uuid('source_transaction_currency_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.currencies`)
      .onDelete('RESTRICT');

    table.uuid('categorization_candidate_id').nullable();
    // Foreign key to be added in the categorization candidates migration after that
    // table exists.

    table
      .string('status', 32)
      .notNullable()
      .defaultTo('posted')
      .checkIn(
        [...LEDGER_TRANSACTION_STATUSES],
        'ledger_transactions_status_check',
      );

    table.uuid('superseded_by_ledger_transaction_id').nullable();
    table.timestamp('superseded_at', { useTz: true }).nullable();
    table
      .uuid('superseded_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('SET NULL');

    table.jsonb('metadata').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));

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
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .foreign(
        ['contact_id', 'company_id'],
        'ledger_transactions_contact_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.contacts`)
      .onDelete('RESTRICT');

    table.unique(['id', 'company_id']);
  });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedTable} IS
    'Immutable ledger posting headers that group ledger entries and track source-driven posting lifecycle.';
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedTable}
      ADD CONSTRAINT ledger_transactions_source_fields_chk
        CHECK (
          (
            transaction_source = 'bank_transaction'
            AND source_transaction_date IS NOT NULL
            AND source_transaction_amount IS NOT NULL
          )
          OR
          (
            transaction_source = 'manual_journal'
            AND source_transaction_date IS NULL
            AND source_transaction_amount IS NULL
          )
        ),
      ADD CONSTRAINT ledger_transactions_status_state_chk
        CHECK (
          (
            status = 'posted'
            AND superseded_by_ledger_transaction_id IS NULL
            AND superseded_at IS NULL
            AND superseded_by_id IS NULL
          )
          OR
          (
            status = 'superseded'
            AND superseded_by_ledger_transaction_id IS NOT NULL
            AND superseded_at IS NOT NULL
            AND superseded_by_id IS NOT NULL
            AND superseded_by_ledger_transaction_id <> id
          )
        ),
      ADD CONSTRAINT ledger_transactions_optional_text_trimmed_chk
        CHECK (
          (description IS NULL OR (description = btrim(description) AND char_length(description) >= 1))
          AND (reference IS NULL OR (reference = btrim(reference) AND char_length(reference) >= 1))
          AND (note IS NULL OR (note = btrim(note) AND char_length(note) >= 1))
        ),
      ADD CONSTRAINT ledger_transactions_superseded_by_fk
        FOREIGN KEY (superseded_by_ledger_transaction_id)
        REFERENCES ${qualifiedTable} (id)
        ON DELETE RESTRICT
        DEFERRABLE INITIALLY DEFERRED;
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX ledger_transactions_active_source_unique
    ON ${qualifiedTable} (
      company_id,
      transaction_source,
      source_transaction_id
    )
    WHERE status = 'posted';
  `);

  await knex.raw(`
    CREATE INDEX ledger_transactions_company_status_date_idx
    ON ${qualifiedTable} (company_id, status, transaction_date DESC, id);
  `);

  await knex.raw(`
    CREATE INDEX ledger_transactions_source_lookup_idx
    ON ${qualifiedTable} (transaction_source, source_transaction_id);
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION "${schemaName}".guard_ledger_transactions_update()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.id IS DISTINCT FROM OLD.id
        OR NEW.company_id IS DISTINCT FROM OLD.company_id
        OR NEW.transaction_date IS DISTINCT FROM OLD.transaction_date
        OR NEW.transaction_source IS DISTINCT FROM OLD.transaction_source
        OR NEW.categorization_source IS DISTINCT FROM OLD.categorization_source
        OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
        OR NEW.contact_type IS DISTINCT FROM OLD.contact_type
        OR NEW.source_transaction_id IS DISTINCT FROM OLD.source_transaction_id
        OR NEW.source_transaction_date IS DISTINCT FROM OLD.source_transaction_date
        OR NEW.source_transaction_amount IS DISTINCT FROM OLD.source_transaction_amount
        OR NEW.source_transaction_currency_id IS DISTINCT FROM OLD.source_transaction_currency_id
        OR NEW.categorization_candidate_id IS DISTINCT FROM OLD.categorization_candidate_id
        OR NEW.created_by_id IS DISTINCT FROM OLD.created_by_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
      THEN
        RAISE EXCEPTION 'Ledger transaction posting fields are immutable';
      END IF;

      IF OLD.status = 'superseded'
        AND (
          NEW.status IS DISTINCT FROM OLD.status
          OR NEW.superseded_by_ledger_transaction_id IS DISTINCT FROM OLD.superseded_by_ledger_transaction_id
          OR NEW.superseded_at IS DISTINCT FROM OLD.superseded_at
          OR NEW.superseded_by_id IS DISTINCT FROM OLD.superseded_by_id
        )
      THEN
        RAISE EXCEPTION 'Ledger transaction supersession is immutable once recorded';
      END IF;

      NEW.updated_at := now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER ledger_transactions_guard_update
      BEFORE UPDATE ON ${qualifiedTable}
      FOR EACH ROW
      EXECUTE FUNCTION "${schemaName}".guard_ledger_transactions_update();

    CREATE OR REPLACE FUNCTION "${schemaName}".prevent_ledger_transactions_delete()
    RETURNS TRIGGER AS $$
    BEGIN
      IF "${schemaName}".is_demo_seed_teardown_allowed(OLD.company_id) THEN
        RETURN OLD;
      END IF;

      RAISE EXCEPTION 'Ledger transactions cannot be hard deleted';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER ledger_transactions_prevent_delete
      BEFORE DELETE ON ${qualifiedTable}
      FOR EACH ROW
      EXECUTE FUNCTION "${schemaName}".prevent_ledger_transactions_delete();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
  await knex.raw(
    `DROP FUNCTION IF EXISTS "${schemaName}".guard_ledger_transactions_update()`,
  );
  await knex.raw(
    `DROP FUNCTION IF EXISTS "${schemaName}".prevent_ledger_transactions_delete()`,
  );
}
