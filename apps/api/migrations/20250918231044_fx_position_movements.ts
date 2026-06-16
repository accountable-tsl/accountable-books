import type { Knex } from 'knex';

/**
 * FX position movements are the append-only lifecycle history for fx_positions.
 * They explain why a position changed, preserve before/after exposure values,
 * and optionally link the movement back to posted ledger evidence.
 */
const schemaName = 'app';
const tableName = 'fx_position_movements';
const qualifiedTable = `"${schemaName}"."${tableName}"`;
const FX_MOVEMENT_TYPES = [
  'opened',
  'increased',
  'partially_settled',
  'fully_settled',
  'revalued',
  'reversed',
  'superseded_reversed',
  'adjusted',
] as const;
const FX_MOVEMENT_SOURCE_TYPES = [
  'ledger_entry',
  'ledger_reversal',
  'ledger_supersession',
  'period_revaluation',
  'manual_adjustment',
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

    table.uuid('fx_position_id').notNullable();

    table.string('source_type', 32).notNullable();
    table
      .string('source_id', 128)
      .nullable()
      .comment('Origin identifier within source_type when available');

    table
      .uuid('ledger_transaction_id')
      .nullable()
      .comment('Posted ledger transaction that provides accounting evidence');
    table
      .uuid('ledger_entry_id')
      .nullable()
      .comment('Posted ledger entry that provides line-level evidence');

    table.string('movement_type', 32).notNullable();
    table.date('movement_date').notNullable();

    table.decimal('foreign_amount_delta', 18, 3).notNullable();
    table.decimal('base_amount_delta', 18, 3).notNullable();
    table.decimal('rate', 32, 10).notNullable();

    table.decimal('open_fx_amount_before', 18, 3).notNullable();
    table.decimal('open_fx_amount_after', 18, 3).notNullable();
    table.decimal('carrying_base_amount_before', 18, 3).notNullable();
    table.decimal('carrying_base_amount_after', 18, 3).notNullable();

    table.decimal('realized_gain_loss_amount', 18, 3).nullable();
    table.decimal('unrealized_gain_loss_amount', 18, 3).nullable();
    table.uuid('reversal_of_movement_id').nullable();

    table
      .jsonb('metadata')
      .notNullable()
      .defaultTo(knex.raw(`'{}'::jsonb`));

    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('RESTRICT');

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(['id', 'company_id'], {
      indexName: 'fx_position_movements_id_company_id_unique',
    });

    table
      .foreign(
        ['fx_position_id', 'company_id'],
        'fx_position_movements_position_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.fx_positions`)
      .onDelete('RESTRICT');

    table
      .foreign(
        ['ledger_transaction_id', 'company_id'],
        'fx_position_movements_ledger_transaction_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.ledger_transactions`)
      .onDelete('RESTRICT');

    table
      .foreign(
        ['ledger_entry_id', 'company_id'],
        'fx_position_movements_ledger_entry_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.ledger_entries`)
      .onDelete('RESTRICT');

    table
      .foreign(
        ['reversal_of_movement_id', 'company_id'],
        'fx_position_movements_reversal_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.fx_position_movements`)
      .onDelete('RESTRICT');
  });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedTable} IS
    'Append-only lifecycle history for FX positions, including openings, revaluations, settlements, reversals, and supersession reversals.';
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedTable}
      ADD CONSTRAINT fx_position_movements_type_chk
        CHECK (movement_type IN (${FX_MOVEMENT_TYPES.map((type) => `'${type}'`).join(', ')})),
      ADD CONSTRAINT fx_position_movements_source_type_chk
        CHECK (source_type IN (${FX_MOVEMENT_SOURCE_TYPES.map((type) => `'${type}'`).join(', ')})),
      ADD CONSTRAINT fx_position_movements_source_id_trimmed_chk
        CHECK (
          source_id IS NULL
          OR (source_id = btrim(source_id) AND char_length(source_id) >= 1)
        ),
      ADD CONSTRAINT fx_position_movements_rate_positive_chk
        CHECK (rate > 0),
      ADD CONSTRAINT fx_position_movements_gain_loss_chk
        CHECK (realized_gain_loss_amount IS NULL OR unrealized_gain_loss_amount IS NULL),
      ADD CONSTRAINT fx_position_movements_ledger_source_chk
        CHECK (
          source_type <> 'ledger_entry'
          OR (ledger_transaction_id IS NOT NULL AND ledger_entry_id IS NOT NULL)
        );
  `);

  await knex.raw(`
    CREATE INDEX fx_position_movements_position_date_idx
      ON ${qualifiedTable} (fx_position_id, movement_date, created_at);

    CREATE INDEX fx_position_movements_source_idx
      ON ${qualifiedTable} (company_id, source_type, source_id)
      WHERE source_id IS NOT NULL;

    CREATE INDEX fx_position_movements_ledger_transaction_idx
      ON ${qualifiedTable} (company_id, ledger_transaction_id)
      WHERE ledger_transaction_id IS NOT NULL;

    CREATE INDEX fx_position_movements_reversal_idx
      ON ${qualifiedTable} (reversal_of_movement_id)
      WHERE reversal_of_movement_id IS NOT NULL;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION "${schemaName}".prevent_fx_position_movements_update_delete()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'fx_position_movements is append-only';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER fx_position_movements_no_update_delete
    BEFORE UPDATE OR DELETE ON ${qualifiedTable}
    FOR EACH ROW
    EXECUTE FUNCTION "${schemaName}".prevent_fx_position_movements_update_delete();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TRIGGER IF EXISTS fx_position_movements_no_update_delete ON ${qualifiedTable};
    DROP FUNCTION IF EXISTS "${schemaName}".prevent_fx_position_movements_update_delete();
  `);

  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
