import type { Knex } from 'knex';

/**
 * Audit events are the append-only product audit trail for tenant-scoped
 * business actions. They capture who did what, to which entity, when it
 * happened, where the request came from, and a versioned payload that explains
 * the domain-specific change.
 */
const schemaName = 'app';
const tableName = 'audit_events';
const sequenceName = 'audit_events_event_sequence_seq';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE SEQUENCE IF NOT EXISTS "${schemaName}"."${sequenceName}" START WITH 1;
  `);

  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('RESTRICT');

    table
      .timestamp('event_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .bigInteger('event_sequence')
      .notNullable()
      .unique({
        indexName: 'audit_events_event_sequence_unique',
      })
      .defaultTo(
        knex.raw(`nextval('"${schemaName}"."${sequenceName}"'::regclass)`),
      );

    table.string('entity_type').notNullable();
    table.uuid('entity_id').notNullable();

    table.string('action').notNullable();

    table.string('actor_type').notNullable();
    table.uuid('actor_id').nullable();
    table
      .uuid('user_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('SET NULL');
    table
      .uuid('impersonated_by_user_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('SET NULL');

    table.text('request_id').nullable();
    table.text('correlation_id').nullable();
    table.specificType('ip', 'inet').nullable();
    table.text('user_agent').nullable();
    table.string('source').notNullable();

    table.jsonb('payload').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
    table.string('schema_version').notNullable();

    table.text('notes').nullable();
  });

  await knex.raw(`
    ALTER SEQUENCE "${schemaName}"."${sequenceName}"
    OWNED BY "${schemaName}"."${tableName}".event_sequence;
  `);

  await knex.raw(`
    COMMENT ON TABLE "${schemaName}"."${tableName}" IS
    'Append-only tenant-scoped product audit event stream for business actions, actors, request context, and versioned domain payloads.';
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
      ADD CONSTRAINT audit_events_action_format_chk
        CHECK (action ~ '^[a-z0-9_]+(\\.[a-z0-9_]+)+$'),
      ADD CONSTRAINT audit_events_entity_type_format_chk
        CHECK (entity_type ~ '^[a-z0-9_]+$'),
      ADD CONSTRAINT audit_events_actor_type_chk
        CHECK (actor_type IN ('user','system','api_key','integration')),
      ADD CONSTRAINT audit_events_source_chk
        CHECK (source IN ('web','api','worker','webhook','import')),
      ADD CONSTRAINT audit_events_actor_id_required_chk
        CHECK (
          (actor_type = 'system' AND actor_id IS NULL)
          OR (actor_type <> 'system' AND actor_id IS NOT NULL)
        ),
      ADD CONSTRAINT audit_events_user_actor_consistency_chk
        CHECK (
          (actor_type = 'user' AND user_id IS NOT NULL AND actor_id = user_id)
          OR (actor_type <> 'user' AND user_id IS NULL)
        );
  `);

  await knex.raw(`
    CREATE INDEX audit_events_company_event_at_desc_idx
      ON "${schemaName}"."${tableName}" (company_id, event_at DESC);

    CREATE INDEX audit_events_company_entity_event_at_desc_idx
      ON "${schemaName}"."${tableName}" (company_id, entity_type, entity_id, event_at DESC);

    CREATE INDEX audit_events_company_action_event_at_desc_idx
      ON "${schemaName}"."${tableName}" (company_id, action, event_at DESC);

    CREATE INDEX audit_events_company_actor_event_at_desc_idx
      ON "${schemaName}"."${tableName}" (company_id, actor_type, actor_id, event_at DESC);

    CREATE INDEX audit_events_user_id_event_at_desc_idx
      ON "${schemaName}"."${tableName}" (user_id, event_at DESC)
      WHERE user_id IS NOT NULL;

    CREATE INDEX audit_events_company_user_id_event_at_desc_idx
      ON "${schemaName}"."${tableName}" (company_id, user_id, event_at DESC)
      WHERE user_id IS NOT NULL;

    CREATE INDEX audit_events_company_request_id_idx
      ON "${schemaName}"."${tableName}" (company_id, request_id);

    CREATE INDEX audit_events_company_correlation_id_idx
      ON "${schemaName}"."${tableName}" (company_id, correlation_id);
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION "${schemaName}".audit_events_prevent_update_delete()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'audit_events is append-only';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER audit_events_no_update_delete
    BEFORE UPDATE OR DELETE ON "${schemaName}"."${tableName}"
    FOR EACH ROW EXECUTE FUNCTION "${schemaName}".audit_events_prevent_update_delete();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TRIGGER IF EXISTS audit_events_no_update_delete ON "${schemaName}"."${tableName}";
    DROP FUNCTION IF EXISTS "${schemaName}".audit_events_prevent_update_delete();
  `);

  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);

  await knex.raw(`
    DROP SEQUENCE IF EXISTS "${schemaName}"."${sequenceName}";
  `);
}
