import type { Knex } from 'knex';

/**
 * Ledger entries are immutable posting lines for a ledger transaction version.
 * Active entries are determined by their parent ledger_transactions.status = 'posted'.
 * Superseded transactions retain their entries unchanged as historical posting lines.
 */

const schemaName = 'app';
const tableName = 'ledger_entries';
const qualifiedTable = `"${schemaName}"."${tableName}"`;

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
    table.date('fs_date').notNullable();
    table.uuid('coa_id').notNullable();

    table
      .uuid('source_currency_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.currencies`)
      .onDelete('RESTRICT');

    table.decimal('source_amount', 18, 3).notNullable();
    table.decimal('system_exchange_rate', 32, 10).notNullable();
    table.decimal('custom_exchange_rate', 32, 10).notNullable();

    table.uuid('contact_id').nullable();
    table
      .specificType('contact_type', `"${schemaName}"."contact_type"`)
      .nullable();
    table.uuid('project_id').nullable();

    table.boolean('is_bank_leg').notNullable().defaultTo(false);
    table.boolean('is_monetary').notNullable().defaultTo(false);
    table.text('fx_transaction_id').nullable();

    table.text('description').nullable();
    table.text('reference').nullable();

    table.boolean('human_reviewed').notNullable().defaultTo(false);
    table.text('review_notes').nullable();
    table
      .uuid('reviewed_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('SET NULL');
    table.timestamp('reviewed_at', { useTz: true }).nullable();

    table.jsonb('metadata').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));

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

    // Composite FKs — tenant isolation
    table
      .foreign(
        ['ledger_transaction_id', 'company_id'],
        'fk_ledger_entry_transaction_company',
      )
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.ledger_transactions`)
      .onDelete('RESTRICT');

    table
      .foreign(['coa_id', 'company_id'], 'fk_ledger_entry_coa_company')
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.coa`)
      .onDelete('RESTRICT');

    table
      .foreign(['contact_id', 'company_id'], 'fk_ledger_entry_contact_company')
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.contacts`)
      .onDelete('RESTRICT');

    table
      .foreign(['project_id', 'company_id'], 'fk_ledger_entry_project_company')
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.projects`)
      .onDelete('RESTRICT');

    table.index(['ledger_transaction_id'], 'ledger_entries_transaction_idx');
    table.unique(['id', 'company_id']);
  });

  // Generated columns — Knex has no builder support for GENERATED ALWAYS AS
  await knex.raw(`
    ALTER TABLE ${qualifiedTable}
      ADD COLUMN absolute_source_amount numeric(18, 3)
        GENERATED ALWAYS AS (abs(source_amount)) STORED,

      ADD COLUMN amount numeric(18, 3)
        GENERATED ALWAYS AS ((source_amount * custom_exchange_rate)::numeric(18, 3)) STORED,

      ADD COLUMN absolute_amount numeric(18, 3)
        GENERATED ALWAYS AS ((abs(source_amount * custom_exchange_rate))::numeric(18, 3)) STORED,

      ADD COLUMN transaction_side "${schemaName}"."debit_credit"
        GENERATED ALWAYS AS (
          CASE
            WHEN source_amount > 0 THEN 'debit'::"${schemaName}"."debit_credit"
            WHEN source_amount < 0 THEN 'credit'::"${schemaName}"."debit_credit"
            ELSE NULL::"${schemaName}"."debit_credit"
          END
        ) STORED,

      ADD COLUMN search_text text
        GENERATED ALWAYS AS (
          trim(both ' ' from lower(
            coalesce(description, '') || ' ' || coalesce(reference, '')
          ))
        ) STORED;
  `);

  // CHECK constraints
  await knex.raw(`
    ALTER TABLE ${qualifiedTable}
      ADD CONSTRAINT ledger_entries_nonzero_amount_chk
        CHECK (amount <> 0),
      ADD CONSTRAINT ledger_entries_exchange_rates_positive
        CHECK (system_exchange_rate > 0 AND custom_exchange_rate > 0);
  `);

  // Indexes that Knex cannot express (DESC, GIN, partial)
  await knex.raw(`
    CREATE INDEX ledger_entries_company_coa_date_idx
      ON ${qualifiedTable} (company_id, coa_id, fs_date DESC);

    CREATE INDEX gin_le_search_trgm_idx
      ON ${qualifiedTable} USING GIN (search_text gin_trgm_ops);

    CREATE INDEX ledger_entries_contact_idx
      ON ${qualifiedTable} (contact_id) WHERE contact_id IS NOT NULL;

    CREATE INDEX ledger_entries_project_idx
      ON ${qualifiedTable} (project_id) WHERE project_id IS NOT NULL;
  `);

  // Immutability guard — only annotation/review fields may change in place
  await knex.raw(`
    CREATE OR REPLACE FUNCTION "${schemaName}".guard_ledger_entries_update()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at := now();

      IF NEW.id IS DISTINCT FROM OLD.id
        OR NEW.company_id IS DISTINCT FROM OLD.company_id
        OR NEW.ledger_transaction_id IS DISTINCT FROM OLD.ledger_transaction_id
        OR NEW.fs_date IS DISTINCT FROM OLD.fs_date
        OR NEW.coa_id IS DISTINCT FROM OLD.coa_id
        OR NEW.source_currency_id IS DISTINCT FROM OLD.source_currency_id
        OR NEW.source_amount IS DISTINCT FROM OLD.source_amount
        OR NEW.system_exchange_rate IS DISTINCT FROM OLD.system_exchange_rate
        OR NEW.custom_exchange_rate IS DISTINCT FROM OLD.custom_exchange_rate
        OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
        OR NEW.contact_type IS DISTINCT FROM OLD.contact_type
        OR NEW.project_id IS DISTINCT FROM OLD.project_id
        OR NEW.is_bank_leg IS DISTINCT FROM OLD.is_bank_leg
        OR NEW.is_monetary IS DISTINCT FROM OLD.is_monetary
        OR NEW.fx_transaction_id IS DISTINCT FROM OLD.fx_transaction_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
      THEN
        RAISE EXCEPTION
          'Ledger entries are immutable. Only description, reference, '
          'review fields, metadata, and updated_by_id may change.';
      END IF;

      IF ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
        RETURN NEW;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER guard_ledger_entries_update
      BEFORE UPDATE ON ${qualifiedTable}
      FOR EACH ROW EXECUTE FUNCTION "${schemaName}".guard_ledger_entries_update();
  `);

  // Hard-delete prevention (except demo seed teardown)
  await knex.raw(`
    CREATE OR REPLACE FUNCTION "${schemaName}".prevent_ledger_entries_delete()
    RETURNS TRIGGER AS $$
    BEGIN
      IF "${schemaName}".is_demo_seed_teardown_allowed(OLD.company_id) THEN
        RETURN OLD;
      END IF;

      RAISE EXCEPTION 'Ledger entries are immutable';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER prevent_ledger_entries_delete
      BEFORE DELETE ON ${qualifiedTable}
      FOR EACH ROW EXECUTE FUNCTION "${schemaName}".prevent_ledger_entries_delete();
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION "${schemaName}".validate_ledger_transaction_balance(
      target_ledger_transaction_id uuid
    )
    RETURNS void AS $$
    DECLARE
      target_company_id uuid;
      entry_count integer;
      signed_total numeric;
      debit_total numeric;
      credit_total numeric;
    BEGIN
      SELECT lt.company_id
      INTO target_company_id
      FROM "${schemaName}"."ledger_transactions" lt
      WHERE lt.id = target_ledger_transaction_id;

      IF target_company_id IS NULL THEN
        RETURN;
      END IF;

      IF "${schemaName}".is_demo_seed_teardown_allowed(target_company_id) THEN
        RETURN;
      END IF;

      SELECT
        COUNT(le.id)::integer,
        COALESCE(SUM(le.amount), 0)::numeric,
        COALESCE(SUM(le.amount) FILTER (WHERE le.amount > 0), 0)::numeric,
        COALESCE(SUM(abs(le.amount)) FILTER (WHERE le.amount < 0), 0)::numeric
      INTO entry_count, signed_total, debit_total, credit_total
      FROM ${qualifiedTable} le
      WHERE le.ledger_transaction_id = target_ledger_transaction_id
        AND le.company_id = target_company_id;

      IF entry_count < 2 THEN
        RAISE EXCEPTION
          'Ledger transaction % must have at least two entries, found %',
          target_ledger_transaction_id,
          entry_count;
      END IF;

      IF signed_total <> 0 THEN
        RAISE EXCEPTION
          'Ledger transaction % entries must balance: debits %, credits %, signed total %',
          target_ledger_transaction_id,
          debit_total,
          credit_total,
          signed_total;
      END IF;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION "${schemaName}".enforce_ledger_transaction_balance_for_transaction()
    RETURNS TRIGGER AS $$
    BEGIN
      PERFORM "${schemaName}".validate_ledger_transaction_balance(NEW.id);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION "${schemaName}".enforce_ledger_transaction_balance_for_entry()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        PERFORM "${schemaName}".validate_ledger_transaction_balance(OLD.ledger_transaction_id);
        RETURN OLD;
      END IF;

      PERFORM "${schemaName}".validate_ledger_transaction_balance(NEW.ledger_transaction_id);

      IF TG_OP = 'UPDATE'
        AND NEW.ledger_transaction_id IS DISTINCT FROM OLD.ledger_transaction_id
      THEN
        PERFORM "${schemaName}".validate_ledger_transaction_balance(OLD.ledger_transaction_id);
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE CONSTRAINT TRIGGER ledger_transactions_balance_guard
      AFTER INSERT OR UPDATE OF status ON "${schemaName}"."ledger_transactions"
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION "${schemaName}".enforce_ledger_transaction_balance_for_transaction();

    CREATE CONSTRAINT TRIGGER ledger_entries_balance_guard
      AFTER INSERT OR UPDATE OF company_id, ledger_transaction_id, source_amount, custom_exchange_rate OR DELETE
      ON ${qualifiedTable}
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION "${schemaName}".enforce_ledger_transaction_balance_for_entry();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `DROP TRIGGER IF EXISTS ledger_transactions_balance_guard ON "${schemaName}"."ledger_transactions"`,
  );
  await knex.raw(
    `DROP TRIGGER IF EXISTS ledger_entries_balance_guard ON ${qualifiedTable}`,
  );
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
  await knex.raw(
    `DROP FUNCTION IF EXISTS "${schemaName}".guard_ledger_entries_update() CASCADE`,
  );
  await knex.raw(
    `DROP FUNCTION IF EXISTS "${schemaName}".prevent_ledger_entries_delete() CASCADE`,
  );
  await knex.raw(
    `DROP FUNCTION IF EXISTS "${schemaName}".enforce_ledger_transaction_balance_for_entry()`,
  );
  await knex.raw(
    `DROP FUNCTION IF EXISTS "${schemaName}".enforce_ledger_transaction_balance_for_transaction()`,
  );
  await knex.raw(
    `DROP FUNCTION IF EXISTS "${schemaName}".validate_ledger_transaction_balance(uuid)`,
  );
}
