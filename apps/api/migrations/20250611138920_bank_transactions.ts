import type { Knex } from 'knex';

/**
 * Bank transactions are immutable ingestion records tied to a company bank
 * account. Each row represents one statement line with provider-stable
 * idempotency and optional ledger match state.
 */

const schemaName = 'app';
const tableName = 'bank_transactions';
const qualifiedTable = `"${schemaName}"."${tableName}"`;
const DELETION_ORIGINS = [
  'user_action',
  'batch_reversal',
  'provider_sync',
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table.date('transaction_date').notNullable();
    table.timestamp('transaction_at', { useTz: true }).notNullable();

    table.text('payee').nullable();

    table.text('reference').nullable();
    table.text('description').nullable();
    table.text('additional_notes').nullable();

    table.decimal('amount', 18, 4).notNullable();
    table
      .specificType(
        'absolute_amount',
        'numeric(18, 4) GENERATED ALWAYS AS (abs(amount)) STORED',
      )
      .notNullable();

    table.decimal('system_exchange_rate', 32, 10).notNullable();

    table
      .uuid('bank_account_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.bank_accounts`)
      .onDelete('RESTRICT');

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('RESTRICT');

    table
      .uuid('bank_transaction_batch_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.bank_transaction_batches`)
      .onDelete('RESTRICT');

    table
      .uuid('ledger_transaction_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.ledger_transactions`)
      .onDelete('RESTRICT');

    table.string('idempotency_key', 256).notNullable();
    table
      .jsonb('source_payload')
      .notNullable()
      .defaultTo(knex.raw(`'{}'::jsonb`));

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

    table
      .string('deletion_origin', 32)
      .nullable()
      .checkIn([...DELETION_ORIGINS], 'bank_transactions_deletion_origin_chk');
    table.string('deletion_reason', 512).nullable();

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.boolean('is_deleted').notNullable().defaultTo(false);
    table.timestamp('deleted_at', { useTz: true }).nullable();

    table.specificType(
      'search_text',
      `TEXT GENERATED ALWAYS AS (
        btrim(lower(
          coalesce(payee, '') || ' ' ||
          coalesce(description, '') || ' ' ||
          coalesce(reference, '') || ' ' ||
          coalesce(additional_notes, '')
        ))
      ) STORED`,
    );

    table
      .foreign(
        ['bank_account_id', 'company_id'],
        'bank_transactions_account_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.bank_accounts`)
      .onDelete('RESTRICT');
    table
      .foreign(
        ['bank_transaction_batch_id', 'bank_account_id', 'company_id'],
        'bank_transactions_batch_account_company_fk',
      )
      .references(['id', 'bank_account_id', 'company_id'])
      .inTable(`${schemaName}.bank_transaction_batches`)
      .onDelete('RESTRICT');

    table.unique(['id', 'company_id']);
  });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedTable} IS
    'Immutable bank statement lines ingested per company bank account.';
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedTable}
      ADD CONSTRAINT bank_transactions_system_exchange_rate_chk
        CHECK (system_exchange_rate > 0),
      ADD CONSTRAINT bank_transactions_nonzero_amount_chk
        CHECK (amount <> 0),
      ADD CONSTRAINT bank_transactions_idempotency_key_trimmed_chk
        CHECK (
          idempotency_key = btrim(idempotency_key)
          AND char_length(idempotency_key) >= 1
        ),
      ADD CONSTRAINT bank_transactions_deleted_state_chk
        CHECK (
          (
            is_deleted = false
            AND deleted_at IS NULL
            AND deleted_by_id IS NULL
            AND deletion_origin IS NULL
            AND deletion_reason IS NULL
          )
          OR
          (
            is_deleted = true
            AND deleted_at IS NOT NULL
            AND deletion_origin IS NOT NULL
            AND deletion_reason IS NOT NULL
            AND deletion_reason = btrim(deletion_reason)
            AND char_length(deletion_reason) >= 1
            AND (
              deletion_origin != 'user_action'
              OR deleted_by_id IS NOT NULL
            )
          )
        ),
      ADD CONSTRAINT bank_transactions_optional_text_trimmed_chk
        CHECK (
          (payee IS NULL OR (payee = btrim(payee) AND char_length(payee) >= 1))
          AND (reference IS NULL OR (reference = btrim(reference) AND char_length(reference) >= 1))
          AND (description IS NULL OR (description = btrim(description) AND char_length(description) >= 1))
          AND (additional_notes IS NULL OR (additional_notes = btrim(additional_notes) AND char_length(additional_notes) >= 1))
        );
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX bank_transactions_account_idempotency_key_uniq
    ON ${qualifiedTable} (bank_account_id, idempotency_key);
  `);

  await knex.raw(`
    CREATE INDEX bank_transactions_company_date_idx
    ON ${qualifiedTable} (company_id, is_deleted, transaction_date DESC, id);
  `);

  await knex.raw(`
    CREATE INDEX bank_transactions_account_date_idx
    ON ${qualifiedTable} (
      bank_account_id,
      is_deleted,
      transaction_date,
      transaction_at,
      id
    );
  `);

  await knex.raw(`
    CREATE INDEX bank_transactions_batch_id_idx
    ON ${qualifiedTable} (bank_transaction_batch_id);
  `);

  await knex.raw(`
    CREATE INDEX bank_transactions_ledger_transaction_id_idx
    ON ${qualifiedTable} (ledger_transaction_id)
    WHERE ledger_transaction_id IS NOT NULL;
  `);

  await knex.raw(`
    CREATE INDEX bank_transactions_search_text_trgm_idx
    ON ${qualifiedTable}
    USING GIN ((CASE WHEN is_deleted = FALSE THEN search_text END) gin_trgm_ops);
  `);

  await knex.raw(`
    CREATE INDEX bank_transactions_transaction_date_brin_idx
    ON ${qualifiedTable}
    USING BRIN (transaction_date);
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION "${schemaName}".guard_bank_transactions_update()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.id IS DISTINCT FROM OLD.id
        OR NEW.transaction_date IS DISTINCT FROM OLD.transaction_date
        OR NEW.transaction_at IS DISTINCT FROM OLD.transaction_at
        OR NEW.payee IS DISTINCT FROM OLD.payee
        OR NEW.reference IS DISTINCT FROM OLD.reference
        OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.additional_notes IS DISTINCT FROM OLD.additional_notes
        OR NEW.amount IS DISTINCT FROM OLD.amount
        OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id
        OR NEW.company_id IS DISTINCT FROM OLD.company_id
        OR NEW.bank_transaction_batch_id IS DISTINCT FROM OLD.bank_transaction_batch_id
        OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
        OR NEW.created_by_id IS DISTINCT FROM OLD.created_by_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
      THEN
        RAISE EXCEPTION 'Bank transaction ingestion fields are immutable';
      END IF;

      NEW.updated_at := now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER bank_transactions_guard_update
      BEFORE UPDATE ON ${qualifiedTable}
      FOR EACH ROW
      EXECUTE FUNCTION "${schemaName}".guard_bank_transactions_update();

    CREATE OR REPLACE FUNCTION "${schemaName}".prevent_bank_transactions_delete()
    RETURNS TRIGGER AS $$
    BEGIN
      IF "${schemaName}".is_demo_seed_teardown_allowed(OLD.company_id) THEN
        RETURN OLD;
      END IF;

      RAISE EXCEPTION 'Bank transactions cannot be hard deleted';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER bank_transactions_prevent_delete
      BEFORE DELETE ON ${qualifiedTable}
      FOR EACH ROW
      EXECUTE FUNCTION "${schemaName}".prevent_bank_transactions_delete();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
  await knex.raw(
    `DROP FUNCTION IF EXISTS "${schemaName}".guard_bank_transactions_update()`,
  );
  await knex.raw(
    `DROP FUNCTION IF EXISTS "${schemaName}".prevent_bank_transactions_delete()`,
  );
}
