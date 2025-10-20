import type { Knex } from 'knex';
import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db';

const tableName = 'fiscal_calendar';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');

    table.integer('fiscal_year').notNullable();
    table.integer('period_number').notNullable();
    table
      .enum('period_type', ['monthly', 'quarterly', 'yearly'])
      .notNullable()
      .defaultTo('monthly');

    table.date('start_date').notNullable();
    table.date('end_date').notNullable();

    table.string('status', 20).notNullable().defaultTo('open');
    table.timestamp('closed_at', { useTz: true });
    table.uuid('closed_by_id').references('id').inTable('users');

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.primary([
      'company_id',
      'fiscal_year',
      'period_number',
      'period_type',
    ]);

    table.jsonb('metadata').nullable();
  });

  // Index for date-based lookups (getFiscalPeriodForDate)
  await knex.raw(`
    CREATE INDEX fiscal_calendar_date_lookup_idx
      ON ${tableName} (company_id, start_date, end_date)
      WHERE status != 'deleted';
  `);

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS fiscal_calendar_date_lookup_idx;`);
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
