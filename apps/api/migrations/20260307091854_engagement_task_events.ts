import type { Knex } from 'knex';

const tableName = 'engagement_task_events';

const EVENT_TYPES = [
  'created',
  'assigned',
  'status_changed',
  'comment',
  'blocker_added',
  'blocker_resolved',
  'due_date_changed',
  'priority_changed',
];
const ACTOR_TYPES = ['user', 'system', 'ai'];

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
      .string('event_type', 24)
      .notNullable()
      .checkIn(EVENT_TYPES, 'engagement_task_events_type_check');

    table
      .uuid('actor_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table
      .string('actor_type', 10)
      .notNullable()
      .defaultTo('system')
      .checkIn(ACTOR_TYPES, 'engagement_task_events_actor_type_check');

    table.text('old_value').nullable();
    table.text('new_value').nullable();
    table.text('comment').nullable();
    table.jsonb('metadata').nullable();

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX engagement_task_events_task_created_idx
    ON ${tableName} (task_id, created_at);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(tableName);
}
