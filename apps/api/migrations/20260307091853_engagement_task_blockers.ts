import type { Knex } from 'knex';

const tableName = 'engagement_task_blockers';

const BLOCKER_TYPES = ['system_condition', 'client_action', 'upstream_task'];
const SEVERITIES = ['hard', 'warning'];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('task_id')
      .notNullable()
      .references('id')
      .inTable('engagement_tasks')
      .onDelete('CASCADE');

    table
      .string('blocker_type', 20)
      .notNullable()
      .checkIn(BLOCKER_TYPES, 'engagement_task_blockers_type_check');

    table.text('code').notNullable();

    table
      .string('severity', 10)
      .notNullable()
      .checkIn(SEVERITIES, 'engagement_task_blockers_severity_check');

    table.text('message').notNullable();
    table.jsonb('details').nullable();

    table
      .uuid('blocking_task_id')
      .nullable()
      .references('id')
      .inTable('engagement_tasks')
      .onDelete('CASCADE');

    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('resolved_at', { useTz: true }).nullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX engagement_task_blockers_natural_key
    ON ${tableName} (
      task_id,
      code,
      COALESCE(blocking_task_id, '00000000-0000-0000-0000-000000000000')
    );
  `);

  await knex.raw(`
    CREATE INDEX engagement_task_blockers_task_active_idx
    ON ${tableName} (task_id, is_active)
    WHERE is_active = true;
  `);

  await knex.raw(`
    CREATE INDEX engagement_task_blockers_blocking_task_idx
    ON ${tableName} (blocking_task_id)
    WHERE blocking_task_id IS NOT NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(tableName);
}
