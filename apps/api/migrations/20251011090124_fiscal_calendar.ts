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
      .enu('period_type', ['monthly', 'quarterly', 'yearly'], {
        useNative: true,
        enumName: 'fiscal_period_type',
      })
      .notNullable();

    table.date('start_date').notNullable();
    table.date('end_date').notNullable();

    table
      .enu('status', ['open', 'closed', 'locked'], {
        useNative: true,
        enumName: 'fiscal_calendar_status',
      })
      .notNullable()
      .defaultTo('open');

    table.timestamp('closed_at', { useTz: true });
    table
      .uuid('closed_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

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

    table.check('end_date >= start_date', [], 'fiscal_calendar_dates_valid');
  });

  // Generated daterange with inclusive bounds
  await knex.raw(`
    ALTER TABLE ${tableName}
      ADD COLUMN period_span daterange
      GENERATED ALWAYS AS (daterange(start_date, end_date, '[]')) STORED;
  `);

  // GiST index for overlaps
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${tableName}_span_gist_idx
      ON ${tableName}
      USING GIST (company_id, period_type, period_span);
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${tableName}_company_type_start_idx
      ON ${tableName} (company_id, period_type, start_date);
  `);

  await knex.raw(`
    ALTER TABLE ${tableName}
      ADD CONSTRAINT ${tableName}_no_overlap
      EXCLUDE USING GIST (
        company_id WITH =,
        period_type WITH =,
        period_span WITH &&
      );
  `);

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.raw(
    `ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS ${tableName}_no_overlap;`,
  );
  await knex.raw(`DROP INDEX IF EXISTS ${tableName}_span_gist_idx;`);
  await knex.raw(`DROP INDEX IF EXISTS ${tableName}_company_type_start_idx;`);
  await knex.raw(`DROP INDEX IF EXISTS ${tableName}_date_lookup_idx;`);
  await knex.schema.dropTableIfExists(tableName);
  await knex.raw(`DROP TYPE IF EXISTS fiscal_calendar_status;`);
  await knex.raw(`DROP TYPE IF EXISTS fiscal_period_type;`);
}
