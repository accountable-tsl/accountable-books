import type { Knex } from 'knex';

/**
 * Product-level activity stream. This is user-meaningful history, not an audit
 * log of every table mutation and not the source of queue/accounting truth.
 */
const schemaName = 'app';
const tableName = 'activity_events';
const qualifiedTable = `"${schemaName}"."${tableName}"`;

const ACTOR_TYPES = ['user', 'system'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('firm_company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('RESTRICT');

    table
      .uuid('client_company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('RESTRICT');

    table
      .string('actor_type', 16)
      .notNullable()
      .checkIn([...ACTOR_TYPES], 'activity_events_actor_type_chk');
    table
      .uuid('actor_user_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('RESTRICT');

    table.text('source_entity_type').notNullable();
    table.uuid('source_entity_id').nullable();
    table.text('source_entity_key').nullable();

    table
      .uuid('ledger_transaction_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.ledger_transactions`)
      .onDelete('RESTRICT');

    table.uuid('fiscal_calendar_id').nullable();

    table.text('work_type').nullable();
    table
      .uuid('work_item_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.work_items`)
      .onDelete('RESTRICT');
    table
      .uuid('work_item_subject_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.work_item_subjects`)
      .onDelete('RESTRICT');

    table.text('event_type').notNullable();
    table.integer('item_count').nullable();
    table.decimal('amount', 18, 3).nullable();
    table
      .uuid('currency_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.currencies`)
      .onDelete('RESTRICT');

    table.jsonb('metadata').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
    table.text('idempotency_key').notNullable();

    table
      .timestamp('occurred_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(['idempotency_key'], {
      indexName: 'activity_events_idempotency_unique',
    });

    table
      .foreign(
        ['fiscal_calendar_id', 'client_company_id'],
        'activity_events_fiscal_calendar_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.fiscal_calendar`)
      .onDelete('RESTRICT');
  });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedTable} IS
    'Append-only product activity stream for user-meaningful transaction, suggestion, journal, close, and future notification history.';
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedTable}
      ADD CONSTRAINT activity_events_actor_user_chk
        CHECK (
          (actor_type = 'user' AND actor_user_id IS NOT NULL)
          OR
          (actor_type = 'system' AND actor_user_id IS NULL)
        ),
      ADD CONSTRAINT activity_events_source_identity_chk
        CHECK (
          (source_entity_id IS NOT NULL AND source_entity_key IS NULL)
          OR
          (source_entity_id IS NULL AND source_entity_key IS NOT NULL)
        ),
      ADD CONSTRAINT activity_events_event_type_format_chk
        CHECK (event_type ~ '^[a-z0-9_]+$'),
      ADD CONSTRAINT activity_events_source_type_format_chk
        CHECK (source_entity_type ~ '^[a-z0-9_]+$'),
      ADD CONSTRAINT activity_events_item_count_positive_chk
        CHECK (item_count IS NULL OR item_count > 0),
      ADD CONSTRAINT activity_events_amount_currency_chk
        CHECK (amount IS NULL OR currency_id IS NOT NULL),
      ADD CONSTRAINT activity_events_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object');
  `);

  await knex.raw(`
    CREATE INDEX activity_events_firm_occurred_idx
      ON ${qualifiedTable} (firm_company_id, occurred_at DESC);

    CREATE INDEX activity_events_client_occurred_idx
      ON ${qualifiedTable} (client_company_id, occurred_at DESC);

    CREATE INDEX activity_events_firm_type_occurred_idx
      ON ${qualifiedTable} (firm_company_id, event_type, occurred_at DESC);

    CREATE INDEX activity_events_source_id_idx
      ON ${qualifiedTable} (source_entity_type, source_entity_id, occurred_at DESC)
      WHERE source_entity_id IS NOT NULL;

    CREATE INDEX activity_events_source_key_idx
      ON ${qualifiedTable} (source_entity_type, source_entity_key, occurred_at DESC)
      WHERE source_entity_key IS NOT NULL;

    CREATE INDEX activity_events_ledger_transaction_idx
      ON ${qualifiedTable} (ledger_transaction_id, occurred_at DESC)
      WHERE ledger_transaction_id IS NOT NULL;

    CREATE INDEX activity_events_actor_user_idx
      ON ${qualifiedTable} (actor_user_id, occurred_at DESC)
      WHERE actor_user_id IS NOT NULL;

    CREATE INDEX activity_events_period_idx
      ON ${qualifiedTable} (client_company_id, fiscal_calendar_id, occurred_at DESC)
      WHERE fiscal_calendar_id IS NOT NULL;

    CREATE INDEX activity_events_work_item_idx
      ON ${qualifiedTable} (work_item_id, occurred_at DESC)
      WHERE work_item_id IS NOT NULL;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION "${schemaName}".prevent_activity_events_update_delete()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'activity_events is append-only';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER activity_events_no_update_delete
    BEFORE UPDATE OR DELETE ON ${qualifiedTable}
    FOR EACH ROW
    EXECUTE FUNCTION "${schemaName}".prevent_activity_events_update_delete();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TRIGGER IF EXISTS activity_events_no_update_delete ON ${qualifiedTable};
    DROP FUNCTION IF EXISTS "${schemaName}".prevent_activity_events_update_delete();
  `);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
