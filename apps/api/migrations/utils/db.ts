import type { Knex } from 'knex';

export function addStandardColumns(knex: Knex, table: Knex.CreateTableBuilder) {
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
}

export async function createUpdateTimestampTrigger(
  knex: Knex,
  tableName: string,
) {
  const quoted = `"${tableName}"`;
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Create the trigger for the specific table
  await knex.raw(`
    CREATE TRIGGER update_${tableName}_timestamp
    BEFORE UPDATE ON ${quoted}
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
  `);
}

export async function dropUpdateTimestampTrigger(
  knex: Knex,
  tableName: string,
) {
  const quoted = `"${tableName}"`;

  await knex.raw(
    `DROP TRIGGER IF EXISTS update_${tableName}_timestamp ON ${quoted};`,
  );
}

export async function preventUpdateOrDelete(knex: Knex, tableName: string) {
  const quoted = `"${tableName}"`;
  await knex.raw(`
    CREATE OR REPLACE FUNCTION prevent_update_or_delete()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'Updates or deletions are not allowed on table: %', TG_TABLE_NAME;
    END;
    $$ LANGUAGE plpgsql;
    `);

  // Create the trigger for the specific table
  await knex.raw(`
    CREATE TRIGGER prevent_update_or_delete_${tableName}
    BEFORE UPDATE OR DELETE ON ${quoted}
    FOR EACH ROW
    EXECUTE FUNCTION prevent_update_or_delete();
  `);
}
