import type { Knex } from 'knex';

const tableName = 'audit_events';
export async function up(knex: Knex): Promise<void> {
  // Create sequence for global event ordering
  await knex.raw(`CREATE SEQUENCE IF NOT EXISTS audit_events_seq START 1;`);

  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('RESTRICT');

    table
      .specificType('event_at', 'timestamptz')
      .notNullable()
      .defaultTo(knex.raw(`timezone('utc', now())`));

    table
      .bigInteger('event_sequence')
      .notNullable()
      .defaultTo(knex.raw(`nextval('audit_events_seq')`)); // global ordering

    // Subject (what it’s about)
    table.string('entity_type').notNullable();
    table.uuid('entity_id').notNullable();

    // Action (what happened)
    table.string('action').notNullable();

    // Actor (who did it)
    table.string('actor_type').notNullable(); // user|system|api_key|integration
    table.uuid('actor_id').nullable(); // nullable for system
    table
      .uuid('user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL'); // convenience if actor_type=user
    table
      .uuid('impersonated_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    // Trace / Context
    table.text('request_id').nullable();
    table.text('correlation_id').nullable();
    table.specificType('ip', 'inet').nullable();
    table.text('user_agent').nullable();
    table.string('source').nullable(); // web|api|worker|import|webhook

    // Payload
    table.jsonb('payload').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
    table.string('schema_version').notNullable();

    // Optional notes
    table.text('notes').nullable();
  });

  // Constraints (data hygiene)
  await knex.raw(`
    ALTER TABLE ${tableName}
      ADD CONSTRAINT audit_events_action_format_chk
        CHECK (action ~ '^[a-z0-9_]+(\\.[a-z0-9_]+)+$'),
      ADD CONSTRAINT audit_events_entity_type_format_chk
        CHECK (entity_type ~ '^[a-z0-9_]+$'),
      ADD CONSTRAINT audit_events_actor_type_chk
        CHECK (actor_type IN ('user','system','api_key','integration')),
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

  // Indexes (company-scoped, time-ordered)
  await knex.raw(`
    CREATE INDEX audit_events_company_event_at_desc_idx
      ON ${tableName} (company_id, event_at DESC);

    CREATE INDEX audit_events_company_entity_event_at_desc_idx
      ON ${tableName} (company_id, entity_type, entity_id, event_at DESC);

    CREATE INDEX audit_events_company_action_event_at_desc_idx
      ON ${tableName} (company_id, action, event_at DESC);

    CREATE INDEX audit_events_company_actor_event_at_desc_idx
      ON ${tableName} (company_id, actor_type, actor_id, event_at DESC);

    -- Cross-tenant user activity lookups (e.g., bookkeepers across companies)
    CREATE INDEX audit_events_user_id_event_at_desc_idx
      ON ${tableName} (user_id, event_at DESC)
      WHERE user_id IS NOT NULL;

    -- Tenant-scoped user activity (still common and often faster than global)
    CREATE INDEX audit_events_company_user_id_event_at_desc_idx
      ON ${tableName} (company_id, user_id, event_at DESC)
      WHERE user_id IS NOT NULL;

    CREATE INDEX audit_events_company_request_id_idx
      ON ${tableName} (company_id, request_id);

    CREATE INDEX audit_events_company_correlation_id_idx
      ON ${tableName} (company_id, correlation_id);
  `);

  // Make table append-only (immutability)
  await knex.raw(`
    CREATE OR REPLACE FUNCTION audit_events_prevent_update_delete()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'audit_events is append-only';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER audit_events_no_update_delete
    BEFORE UPDATE OR DELETE ON ${tableName}
    FOR EACH ROW EXECUTE FUNCTION audit_events_prevent_update_delete();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TRIGGER IF EXISTS audit_events_no_update_delete ON ${tableName};
    DROP FUNCTION IF EXISTS audit_events_prevent_update_delete();
  `);

  await knex.schema.dropTableIfExists(tableName);

  await knex.raw(`DROP SEQUENCE IF EXISTS audit_events_seq;`);
}
